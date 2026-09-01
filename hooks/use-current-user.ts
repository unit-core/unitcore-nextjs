'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

export interface CurrentUser {
  email: string | null
  /** `full_name` from the identity provider. Email sign-ups carry none. */
  name: string | null
  /** `avatar_url` from the identity provider. Email sign-ups carry none. */
  image: string | null
}

function toCurrentUser(user: User): CurrentUser {
  const metadata = user.user_metadata as {
    full_name?: string
    avatar_url?: string
  }
  return {
    email: user.email ?? null,
    name: metadata.full_name ?? null,
    image: metadata.avatar_url ?? null,
  }
}

/**
 * The signed-in user as the browser sees it, or null.
 *
 * A client hook on purpose. Reading the session on the server would mean
 * `cookies()` in the root layout, which opts every page out of static
 * rendering — including the blog, which is the whole reason the layout is
 * static today. So the header resolves after hydration instead.
 *
 * The Supabase avatar block reads the session once in an effect;
 * `onAuthStateChange` fires the same stored session and then again on sign-in
 * or sign-out, which keeps the header honest without a reload. This decides
 * what the header shows only: /settings is behind the proxy, so nothing here
 * is a permission check.
 */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? toCurrentUser(session.user) : null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return user
}
