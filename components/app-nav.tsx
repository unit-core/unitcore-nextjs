'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useCurrentUser } from '@/hooks/use-current-user'
import { stripLocale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { cn } from '@/lib/utils'

/**
 * The links that only mean something with an account behind them. Tasks is a
 * section of its own, next to the dashboard, not a tab inside settings.
 *
 * A client island for the same reason the avatar is one: reading the session on
 * the server would mean `cookies()` in the root layout, which opts the blog and
 * the landing page out of static rendering. So this resolves after hydration,
 * and a signed-out visitor never sees a link that would only bounce them to the
 * login form.
 */
export function AppNav({ dict }: { dict: Dictionary['nav'] }) {
  const user = useCurrentUser()
  const locale = useLocale()
  const path = stripLocale(usePathname())

  if (!user) return null

  const isCurrent = path === '/tasks' || path.startsWith('/tasks/')

  return (
    <Link
      href={localeHref(locale, '/tasks')}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'transition-colors hover:text-foreground',
        isCurrent ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {dict.tasks}
    </Link>
  )
}
