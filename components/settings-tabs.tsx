'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { stripLocale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { cn } from '@/lib/utils'

/**
 * A client component for one reason: the active tab. `usePathname` is compared
 * with the locale stripped off, so /en/settings/spaces and /ru/settings/spaces
 * both mark the same tab, and a third language needs no change here.
 */
export function SettingsTabs({ dict }: { dict: Dictionary['settings']['tabs'] }) {
  const locale = useLocale()
  const path = stripLocale(usePathname())

  const tabs = [
    { href: '/settings/connections', label: dict.connections },
    { href: '/settings/spaces', label: dict.spaces },
  ]

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        // startsWith, so /settings/spaces/<id> keeps its tab lit.
        const isActive = path === tab.href || path.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={localeHref(locale, tab.href)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              isActive
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
