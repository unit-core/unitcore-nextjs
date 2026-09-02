'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * One space in the list, with the number of people in it.
 *
 * Read from `public.my_spaces`, a security_invoker view over `spaces` that
 * answers with `is_mine` instead of a raw `owner_id`, so a foreign user id
 * never reaches the browser. The head count comes from `public.space_people`,
 * the only view that says anything about people at all: `profiles` carries no
 * SELECT grant for `authenticated`.
 */
export interface SpaceSummary {
  id: string
  name: string
  isDefault: boolean
  isMine: boolean
  memberCount: number
}

interface SpaceRow {
  id: string
  name: string
  is_default: boolean
  is_mine: boolean
  created_at: string
}

export const useSpaces = () => {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Same shape as useOAuthGrants: the load lives inside the effect so an
  // unmounted page stops setting state halfway through, and a counter is what
  // asks for it again.
  const [reloadToken, setReloadToken] = useState(0)
  const userId = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) {
        if (active) {
          setError(userError?.message ?? 'You are not signed in.')
          setIsLoading(false)
        }
        return
      }
      userId.current = user.id

      const { data: rows, error: rowsError } = await supabase
        .from('my_spaces')
        .select('id, name, is_default, is_mine, created_at')
        .order('is_default', { ascending: false })
        .order('created_at')
        .returns<SpaceRow[]>()
      if (rowsError) {
        if (active) {
          setError(rowsError.message)
          setIsLoading(false)
        }
        return
      }

      // One query for every space rather than one per card: RLS already limits
      // the rows to spaces this user belongs to, so the whole set is small and
      // counting it here costs less than a round trip each.
      const { data: people, error: peopleError } = await supabase
        .from('space_people')
        .select('space_id')
        .returns<{ space_id: string }[]>()
      if (peopleError) {
        if (active) {
          setError(peopleError.message)
          setIsLoading(false)
        }
        return
      }

      const counts = new Map<string, number>()
      for (const row of people ?? []) {
        counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
      }

      if (!active) return

      setSpaces(
        (rows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          isDefault: row.is_default,
          isMine: row.is_mine,
          memberCount: counts.get(row.id) ?? 0,
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
   * `spaces.owner_id` has no default and RLS demands it equal `auth.uid()`, so
   * it is passed explicitly — the same reason `create_space` takes a user id in
   * lib/mcp/tools.ts. The membership row is not created here: the
   * `spaces_add_owner_as_member` trigger does it.
   */
  const createSpace = useCallback(async (name: string) => {
    if (!userId.current) return false

    setIsCreating(true)
    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('spaces')
      .insert({ name: name.trim(), owner_id: userId.current })
      .select('id')
      .single()
    setIsCreating(false)

    if (insertError) {
      setError(insertError.message)
      return false
    }

    setError(null)
    setReloadToken((token) => token + 1)
    return true
  }, [])

  /**
   * Asked for by the invitations section above the list: accepting one makes a
   * space yours, and `my_spaces` only started answering about it a moment ago.
   */
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return { spaces, isLoading, isCreating, error, createSpace, reload }
}
