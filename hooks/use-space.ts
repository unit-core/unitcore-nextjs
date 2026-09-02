'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { refusalMessage, rpcRefusal, type RpcResult } from '@/lib/supabase/errors'

export interface SpaceDetail {
  id: string
  name: string
  isDefault: boolean
  isMine: boolean
}

/**
 * A person in a space, as `public.space_people` describes them: a name and an
 * avatar, never an address. Finding someone to invite goes the other way
 * round, through `preview_invite_target`, which answers about a tag its owner
 * handed over — so nobody can be enumerated from here, and no address is
 * involved at any point.
 */
export interface SpaceMember {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}

/**
 * An invitation this space has sent and nobody has answered yet, from
 * `public.space_pending_invites`. Only the owner sees any: the view is limited
 * to invitations you sent yourself.
 */
export interface PendingInvite {
  id: string
  inviteeName: string | null
  inviteeAvatar: string | null
  createdAt: string
  expiresAt: string
}

/** Who a tag resolved to, for the confirmation step to show. */
export interface InvitePreview {
  displayName: string | null
  avatarUrl: string | null
}

/** How the invitation went: both are successes, with different words. */
export type InviteOutcome = 'invited' | 'already_invited'

/** What the refusals below have to say. The hook holds no strings itself. */
export interface SpaceMessages {
  notAllowed: string
  silent: string
  unknown: string
  invite: {
    notFound: string
    self: string
    already: string
    spaceFull: string
    tooManyPending: string
    rateLimited: string
  }
  pending: { gone: string }
  members: { notAMember: string }
  leave: { notAMember: string }
}

export type SpaceBusy =
  | { kind: 'rename' | 'remove' | 'leave' | 'invite' | 'preview' }
  | { kind: 'removeMember'; userId: string }
  | { kind: 'revokeInvite'; inviteId: string }
  | null

interface SpaceRow {
  id: string
  name: string
  is_default: boolean
  is_mine: boolean
}

interface MemberRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  is_owner: boolean
  is_me: boolean
  created_at: string
}

interface PendingRow {
  id: string
  invitee_name: string | null
  invitee_avatar: string | null
  created_at: string
  expires_at: string
}

export const useSpace = (spaceId: string, messages: SpaceMessages) => {
  const [space, setSpace] = useState<SpaceDetail | null>(null)
  const [members, setMembers] = useState<SpaceMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
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
          setPendingInvites([])
          setError(null)
          setIsLoading(false)
        }
        return
      }

      const { data: people, error: peopleError } = await supabase
        .from('space_people')
        .select('user_id, display_name, avatar_url, is_owner, is_me, created_at')
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

      // Only for the owner. A guest's answer would be empty anyway — the view
      // shows the invitations you sent — so this is a round trip saved rather
      // than a rule enforced.
      let pending: PendingRow[] = []
      if (row.is_mine) {
        const { data: sent, error: sentError } = await supabase
          .from('space_pending_invites')
          .select('id, invitee_name, invitee_avatar, created_at, expires_at')
          .eq('space_id', spaceId)
          .eq('status', 'pending')
          .order('created_at')
          .returns<PendingRow[]>()
        if (sentError) {
          if (active) {
            setError(sentError.message)
            setIsLoading(false)
          }
          return
        }
        pending = sent ?? []
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
          displayName: person.display_name,
          avatarUrl: person.avatar_url,
          isOwner: person.is_owner,
          isMe: person.is_me,
        }))
      )
      setPendingInvites(
        pending.map((invite) => ({
          id: invite.id,
          inviteeName: invite.invitee_name,
          inviteeAvatar: invite.invitee_avatar,
          createdAt: invite.created_at,
          expiresAt: invite.expires_at,
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
    // never happened. The same holds for the DELETE below.
    //
    // Nothing else on this page needs the check any more: membership changes
    // through RPCs that answer with an explicit code instead.
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

  /**
   * Step one of two: who does this tag belong to?
   *
   * The tag is sent exactly as it was typed. Case, spaces, dashes, the `UC-`
   * prefix and the `I`/`L`/`O` substitutions are the server's business, and a
   * second implementation here would only disagree with it.
   *
   * `not_found` covers both "no such tag" and "mistyped", on purpose: telling
   * them apart is what would make this an oracle for guessing tags.
   */
  const previewInvite = async (tag: string): Promise<InvitePreview | null> => {
    setBusy({ kind: 'preview' })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('preview_invite_target', { _tag: tag })
    setBusy(null)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return null
    }

    const result = data as RpcResult | null
    const refusal = rpcRefusal(
      result,
      {
        not_found: messages.invite.notFound,
        self: messages.invite.self,
        rate_limited: messages.invite.rateLimited,
      },
      messages.unknown
    )
    if (refusal) {
      setError(refusal)
      return null
    }

    setError(null)
    return {
      displayName: typeof result?.display_name === 'string' ? result.display_name : null,
      avatarUrl: typeof result?.avatar_url === 'string' ? result.avatar_url : null,
    }
  }

  /**
   * Step two: send it. Nobody is added to anything here — the invitation waits
   * until the person it names accepts it.
   *
   * `already_invited` arrives with `ok: true` and the id of the invitation that
   * is already open, so a second attempt is a success with different wording,
   * not an error and not a second row.
   */
  const invite = async (tag: string): Promise<InviteOutcome | null> => {
    setBusy({ kind: 'invite' })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('invite_to_space', {
      _space_id: spaceId,
      _tag: tag,
    })
    setBusy(null)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return null
    }

    const result = data as RpcResult | null
    const refusal = rpcRefusal(
      result,
      {
        not_found: messages.invite.notFound,
        self_invite: messages.invite.self,
        already_member: messages.invite.already,
        space_full: messages.invite.spaceFull,
        too_many_pending: messages.invite.tooManyPending,
        rate_limited: messages.invite.rateLimited,
      },
      messages.unknown
    )
    if (refusal) {
      setError(refusal)
      return null
    }

    setError(null)
    reload()
    return result?.code === 'already_invited' ? 'already_invited' : 'invited'
  }

  /** Takes the pending invitation back. Only the owner may. */
  const revokeInvite = async (inviteId: string) => {
    setBusy({ kind: 'revokeInvite', inviteId })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('revoke_space_invite', {
      _invite_id: inviteId,
    })
    setBusy(null)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return false
    }

    const refusal = rpcRefusal(
      data as RpcResult | null,
      { not_found: messages.pending.gone, not_pending: messages.pending.gone },
      messages.unknown
    )
    if (refusal) {
      setError(refusal)
      // Whatever the invitation became, the list on screen predates it.
      reload()
      return false
    }

    setError(null)
    reload()
    return true
  }

  /**
   * `_confirm` is left out on purpose. It exists so an MCP client has to name
   * the person it is removing; here a human clicked the row next to that
   * person's name, which is the same guarantee by other means.
   */
  const removeMember = async (userId: string) => {
    setBusy({ kind: 'removeMember', userId })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('remove_space_member', {
      _space_id: spaceId,
      _user_id: userId,
    })
    setBusy(null)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return false
    }

    const refusal = rpcRefusal(
      data as RpcResult | null,
      { not_a_member: messages.members.notAMember },
      messages.unknown
    )
    if (refusal) {
      setError(refusal)
      reload()
      return false
    }

    setError(null)
    reload()
    return true
  }

  /**
   * An owner cannot leave their own space: `leave_space` raises 42501, which
   * reads as the "only the owner can" sentence — the same guard the page
   * already keeps the button hidden for.
   */
  const leave = async () => {
    setBusy({ kind: 'leave' })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('leave_space', { _space_id: spaceId })
    setBusy(null)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return false
    }

    const refusal = rpcRefusal(
      data as RpcResult | null,
      { not_a_member: messages.leave.notAMember },
      messages.unknown
    )
    if (refusal) {
      setError(refusal)
      return false
    }

    return true
  }

  return {
    space,
    members,
    pendingInvites,
    isLoading,
    error,
    busy,
    rename,
    remove,
    previewInvite,
    invite,
    revokeInvite,
    removeMember,
    leave,
  }
}
