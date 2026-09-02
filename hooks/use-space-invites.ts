'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import { refusalMessage, rpcRefusal, type RpcResult } from '@/lib/supabase/errors'

/**
 * An invitation waiting for you, as `public.my_space_invites` describes it:
 * pending, addressed to you, not yet expired.
 *
 * This is everything you may know about a space you have not joined — its
 * name, who is asking, and how many people are already inside. Not its
 * transactions, not its member list, and not the space itself: `my_spaces`
 * only answers about spaces you belong to.
 */
export interface SpaceInvite {
  id: string
  spaceId: string
  spaceName: string
  inviterName: string
  inviterAvatar: string | null
  memberCount: number
  expiresAt: string
}

/** What the refusals below have to say. The hook holds no strings itself. */
export interface SpaceInviteMessages {
  notAllowed: string
  notFound: string
  expired: string
  revoked: string
  spaceFull: string
  emailUnconfirmed: string
  unknown: string
}

export type SpaceInviteBusy = { kind: 'accept' | 'decline'; id: string } | null

interface InviteRow {
  id: string
  space_id: string
  space_name: string
  inviter_name: string
  inviter_avatar: string | null
  member_count: number
  expires_at: string
}

export const useSpaceInvites = (messages: SpaceInviteMessages) => {
  const [invites, setInvites] = useState<SpaceInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<SpaceInviteBusy>(null)
  // Same shape as useOAuthGrants: the load lives inside the effect so an
  // unmounted page stops setting state halfway through, and a counter is what
  // asks for it again.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()
      const { data, error: rowsError } = await supabase
        .from('my_space_invites')
        .select('id, space_id, space_name, inviter_name, inviter_avatar, member_count, expires_at')
        .order('created_at', { ascending: false })
        .returns<InviteRow[]>()
      if (!active) return

      if (rowsError) {
        setError(rowsError.message)
        setIsLoading(false)
        return
      }

      setInvites(
        (data ?? []).map((row) => ({
          id: row.id,
          spaceId: row.space_id,
          spaceName: row.space_name,
          inviterName: row.inviter_name,
          inviterAvatar: row.inviter_avatar,
          memberCount: row.member_count,
          expiresAt: row.expires_at,
        }))
      )
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [reloadToken])

  /**
   * A card that appears without a reload — the point of the whole flow, since
   * nobody is watching this page when the invitation is sent.
   *
   * Its own effect, with no dependencies, so a reload does not tear the
   * subscription down and build it again. The filter is about traffic, not
   * safety: Realtime checks RLS as the subscriber, and the policy on
   * `space_invites` only ever shows a row to the two people it is between.
   *
   * The whole view is re-read rather than patched from the payload: the row
   * that arrives carries `space_id` and `invitee_id`, while `space_name`,
   * `inviter_name` and `member_count` are joined in by the view.
   */
  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let active = true

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !active) return

      channel = supabase
        .channel(`space-invites:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'space_invites',
            filter: `invitee_id=eq.${user.id}`,
          },
          () => setReloadToken((token) => token + 1)
        )
        .subscribe()
    }

    void subscribe()
    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])

  const reload = () => setReloadToken((token) => token + 1)

  /**
   * The message to show in the card, or null when it worked. Answering rather
   * than setting a hook-wide `error`: a refusal belongs to the one invitation
   * it is about, not to the whole section, and two cards can fail differently.
   */
  const respond = async (
    kind: 'accept' | 'decline',
    id: string,
    codes: Record<string, string>
  ): Promise<string | null> => {
    setBusy({ kind, id })
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc(
      kind === 'accept' ? 'accept_space_invite' : 'decline_space_invite',
      { _invite_id: id }
    )
    setBusy(null)

    if (rpcError) return refusalMessage(rpcError, messages)

    const refusal = rpcRefusal(data as RpcResult | null, codes, messages.unknown)
    if (refusal) {
      // Whatever it was, the card is out of date: an invitation that was
      // revoked or has expired is gone from the view already.
      reload()
      return refusal
    }

    reload()
    return null
  }

  /**
   * `already_member` comes back with `ok: true` — you are in the space, which
   * is what the button promised. `declined` and `accepted` are the invitation's
   * own status coming back at us, and both mean the same thing to the reader:
   * this card is answering for something that is no longer open.
   */
  const accept = (id: string) =>
    respond('accept', id, {
      not_found: messages.notFound,
      expired: messages.expired,
      revoked: messages.revoked,
      declined: messages.notFound,
      accepted: messages.notFound,
      space_full: messages.spaceFull,
      email_unconfirmed: messages.emailUnconfirmed,
    })

  const decline = (id: string) =>
    respond('decline', id, {
      not_found: messages.notFound,
      expired: messages.expired,
      revoked: messages.revoked,
      accepted: messages.notFound,
    })

  return { invites, isLoading, error, busy, accept, decline }
}
