'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { LOCALE_COOKIE, locales, stripLocale, type Locale } from '@/lib/i18n/config'
import { localeHref } from '@/lib/i18n/urls'
import { cn } from '@/lib/utils'

const LABELS: Record<Locale, string> = { en: 'English', ru: 'Русский' }
const SHORT: Record<Locale, string> = { en: 'EN', ru: 'RU' }

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Module scope on purpose: this writes to `document`, and the React Compiler
 * lint rules reject mutating anything defined outside the component from inside
 * its render scope, even from an event handler.
 */
function rememberChoice(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`
}

interface LanguageSwitcherProps {
  current: Locale
  /**
   * slug -> locales that article exists in. Every other page exists in every
   * locale; articles are the one thing that may be translated later, and this
   * is what stops the switcher offering a link to a 404.
   */
  articleLocales: Record<string, readonly Locale[]>
  className?: string
}

/** The slug when the path is an article, otherwise null. */
function articleSlug(path: string): string | null {
  const match = /^\/blog\/([^/]+)$/.exec(path)
  return match ? match[1] : null
}

export function LanguageSwitcher({
  current,
  articleLocales,
  className,
}: LanguageSwitcherProps) {
  // The current path is what lets the switch stay on the same page instead of
  // dumping the reader on the home page, and it is only available on the client.
  const pathname = usePathname()
  const path = stripLocale(pathname)
  const slug = articleSlug(path)
  const available = slug ? (articleLocales[slug] ?? []) : locales
  const options = locales.filter((locale) => available.includes(locale))

  // One language to offer is no choice at all.
  if (options.length < 2) return null

  return (
    <nav aria-label="Language" className={cn('flex items-center gap-1 text-sm', className)}>
      {options.map((locale) => {
        const isCurrent = locale === current
        return (
          <Link
            key={locale}
            href={localeHref(locale, path)}
            hrefLang={locale}
            lang={locale}
            aria-label={LABELS[locale]}
            aria-current={isCurrent ? 'true' : undefined}
            onClick={() => rememberChoice(locale)}
            className={cn(
              'rounded-md px-2 py-1 transition-colors',
              isCurrent
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {SHORT[locale]}
          </Link>
        )
      })}
    </nav>
  )
}
