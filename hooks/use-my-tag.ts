'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { refusalMessage, rpcRefusal, type RpcResult } from '@/lib/supabase/errors'

/** What the refusals below have to say. The hook holds no strings itself. */
export interface TagMessages {
  notAllowed: string
  tooSoon: string
  unknown: string
}

/**
 * Your own profile tag: the ten characters somebody else types to invite you.
 *
 * Read through `my_tag()` and nowhere else. `profiles.tag` carries no SELECT
 * grant for anyone, so `select tag from profiles` is denied even for your own
 * row — the column exists to be matched against, not to be listed.
 *
 * `enabled` is what keeps this off the critical path: the tag lives behind the
 * avatar menu, and fetching it on every page load would cost a round trip per
 * navigation for a string most visits never open. The header passes true the
 * first time the menu opens and leaves it true, so the tag is fetched once.
 */
export const useMyTag = (messages: TagMessages, enabled = true) => {
  const [tag, setTag] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true

    const load = async () => {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc('my_tag')
      if (!active) return

      // Passed through as it arrives: `my_tag` is plain SQL with no guard of
      // its own, so anything it fails with is a fault rather than a refusal
      // anybody could word better.
      if (rpcError) {
        setError(rpcError.message)
        setIsLoading(false)
        return
      }

      setTag(typeof data === 'string' ? data : null)
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [enabled])

  /**
   * A new tag, and the old one stops resolving from that moment. Invitations
   * already sent are unaffected — they point at a user id, not at the tag that
   * found it.
   */
  const regenerate = async () => {
    setIsRegenerating(true)
    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('regenerate_tag')
    setIsRegenerating(false)

    if (rpcError) {
      setError(refusalMessage(rpcError, messages))
      return false
    }

    const result = data as RpcResult | null
    // 'too_soon' is an answer, not a fault: one new tag a minute, so a double
    // click does not burn through the alphabet.
    const refusal = rpcRefusal(result, { too_soon: messages.tooSoon }, messages.unknown)
    if (refusal) {
      setError(refusal)
      return false
    }

    setTag(typeof result?.tag === 'string' ? result.tag : null)
    setError(null)
    return true
  }

  return { tag, isLoading, isRegenerating, error, regenerate }
}
