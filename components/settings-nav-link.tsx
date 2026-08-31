'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { createClient } from '@/lib/supabase/client'

/**
 * A client component on purpose. Reading the session on the server would mean
 * `cookies()` in the root layout, which opts every page out of static
 * rendering — including the blog, which is the whole reason the layout is
 * static today. So the link appears after hydration instead.
 *
 * `onAuthStateChange` fires once with the stored session and again on sign-in
 * or sign-out, which keeps the header honest without a reload. This decides
 * visibility only: /settings is behind the middleware, so nothing here is a
 * permission check.
 */
export function SettingsNavLink({ label }: { label: string }) {
  const locale = useLocale()
  const [isSignedIn, setIsSignedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(session !== null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!isSignedIn) return null

  return (
    <Link
      href={localeHref(locale, '/settings/connections')}
      className="text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </Link>
  )
}
