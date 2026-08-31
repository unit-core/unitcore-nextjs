'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { refusalMessage } from '@/lib/supabase/errors'

export interface SpaceDetail {
  id: string
  name: string
  isDefault: boolean
  isMine: boolean
}

/**
 * A person in a space, as `public.space_people` describes them: a name and an
 * avatar, never an address. Finding someone to add goes the other way round,
 * through `public.invite_lookup`, which answers about an address the inviter
 * already knows — so nobody can be enumerated from here.
 */
export interface SpaceMember {
  userId: string
  fullName: string | null
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}

/** What the refusals below have to say. The hook holds no strings itself. */
export interface SpaceMessages {
  notAllowed: string
  silent: string
  inviteNotFound: string
  inviteAlready: string
}

export type SpaceBusy =
  | { kind: 'rename' | 'remove' | 'leave' | 'invite' }
  | { kind: 'removeMember'; userId: string }
  | null

interface SpaceRow {
  id: string
  name: string
  is_default: boolean
  is_mine: boolean
}

interface MemberRow {
  user_id: string
  full_name: string | null
  avatar_url: string | null
  is_owner: boolean
  is_me: boolean
  created_at: string
}

export const useSpace = (spaceId: string, messages: SpaceMessages) => {
  const [space, setSpace] = useState<SpaceDetail | null>(null)
  const [members, setMembers] = useState<SpaceMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<SpaceBusy>(null)
  // Same shape as useOAuthGrants: the load lives inside the effect so an
  // unmounted page stops setting state halfway through, and a counter is what
  // asks for it again.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      // limit(1) rather than maybeSingle(): a space RLS hides is not an error,
      // it is an empty answer, and that is what the page renders as "not yours
      // any more".
      const { data: rows, error: rowsError } = await supabase
        .from('my_spaces')
        .select('id, name, is_default, is_mine')
        .eq('id', spaceId)
        .limit(1)
        .returns<SpaceRow[]>()
      if (rowsError) {
        if (active) {
          setError(rowsError.message)
          setIsLoading(false)
        }
        return
      }

      const row = rows?.[0]
      if (!row) {
        if (active) {
          setSpace(null)
          setMembers([])
          setError(null)
          setIsLoading(false)
        }
        return
      }

      const { data: people, error: peopleError } = await supabase
        .from('space_people')
        .select('user_id, full_name, avatar_url, is_owner, is_me, created_at')
        .eq('space_id', spaceId)
        .order('created_at')
        .returns<MemberRow[]>()
      if (peopleError) {
        if (active) {
          setError(peopleError.message)
          setIsLoading(false)
        }
        return
      }

      if (!active) return

      setSpace({
        id: row.id,
        name: row.name,
        isDefault: row.is_default,
        isMine: row.is_mine,
      })
      setMembers(
        (people ?? []).map((person) => ({
          userId: person.user_id,
          fullName: person.full_name,
          avatarUrl: person.avatar_url,
          isOwner: person.is_owner,
          isMe: person.is_me,
        }))
      )
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [spaceId, reloadToken])

  // Plain functions rather than useCallback: nothing downstream is memoized,
  // and each of them closes over `messages`, which the dictionary hands us as a
  // fresh object on every render anyway.
  const reload = () => setReloadToken((token) => token + 1)

  const rename = async (name: string) => {
    setBusy({ kind: 'rename' })
    const supabase = createClient()
    const { data, error: updateError } = await supabase
      .from('spaces')
      .update({ name: name.trim() })
      .eq('id', spaceId)
      .select('id')
      .returns<{ id: string }[]>()
    setBusy(null)

    if (updateError) {
      setError(refusalMessage(updateError, messages))
      return false
    }
    // The refusal that arrives silently. An UPDATE only sees the rows the
    // policy's USING clause lets through, so a space that is not yours is
    // filtered out before the statement runs: PostgREST answers with zero rows
    // and no error at all. Treating that as success would report a rename that
    // never happened. The same holds for every DELETE below.
    if (!data?.length) {
      setError(messages.silent)
      return false
    }

    setError(null)
    reload()
    return true
  }

  /** Cascades: transactions, their items, categories and the member list. */
  const remove = async () => {
    setBusy({ kind: 'remove' })
    const supabase = createClient()
    const { data, error: deleteError } = await supabase
      .from('spaces')
      .delete()
      .eq('id', spaceId)
      .select('id')
      .returns<{ id: string }[]>()
    setBusy(null)

    if (deleteError) {
      setError(refusalMessage(deleteError, messages))
      return false
    }
    if (!data?.length) {
      setError(messages.silent)
      return false
    }
    // No reload: the caller navigates away from a page RLS has just stopped
    // answering for.
    return true
  }

  const addMember = async (email: string) => {
    setBusy({ kind: 'invite' })
    const supabase = createClient()

    const { data: found, error: lookupError } = await supabase.rpc('invite_lookup', {
      _email: email.trim(),
    })
    if (lookupError) {
      setBusy(null)
      setError(lookupError.message)
      return false
    }

    const invitedId = found as string | null
    if (!invitedId) {
      setBusy(null)
      setError(messages.inviteNotFound)
      return false
    }

    const { error: insertError } = await supabase
      .from('space_members')
      .insert({ space_id: spaceId, user_id: invitedId })
    setBusy(null)

    if (insertError) {
      setError(
        refusalMessage(insertError, {
          notAllowed: messages.notAllowed,
          duplicate: messages.inviteAlready,
        })
      )
      return false
    }

    setError(null)
    reload()
    return true
  }

  const removeMember = async (userId: string) => {
    setBusy({ kind: 'removeMember', userId })
    const supabase = createClient()
    const { data, error: deleteError } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', userId)
      .select('user_id')
      .returns<{ user_id: string }[]>()
    setBusy(null)

    if (deleteError) {
      setError(refusalMessage(deleteError, messages))
      return false
    }
    if (!data?.length) {
      setError(messages.silent)
      return false
    }

    setError(null)
    reload()
    return true
  }

  /**
   * Leaving is the same DELETE aimed at yourself: the policy lets an owner
   * remove anyone and a member remove themselves. An owner cannot leave their
   * own space, and a trigger says so with 42501.
   */
  const leave = async () => {
    setBusy({ kind: 'leave' })
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setBusy(null)
      setError(messages.silent)
      return false
    }

    const { data, error: deleteError } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', user.id)
      .select('user_id')
      .returns<{ user_id: string }[]>()
    setBusy(null)

    if (deleteError) {
      setError(refusalMessage(deleteError, messages))
      return false
    }
    if (!data?.length) {
      setError(messages.silent)
      return false
    }

    return true
  }

  return {
    space,
    members,
    isLoading,
    error,
    busy,
    rename,
    remove,
    addMember,
    removeMember,
    leave,
  }
}
