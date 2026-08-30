/**
 * Locale primitives. This module is imported by `proxy.ts`, which runs on the
 * Edge runtime, so it must stay dependency-free and must never pull in anything
 * that reaches the MDX registry or the Supabase client.
 *
 * Adding a language is a change to `locales` and a new dictionary file.
 */

export const locales = ['en', 'ru'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

/** Remembers an explicit language choice across visits. Set by the switcher. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value)
}

/**
 * A first segment shaped like a language tag — `fr`, `pt-br` — whether or not
 * we support it. Used to tell "no locale prefix, add one" apart from "a locale
 * we do not have", which must 404 rather than be prefixed again.
 */
export function looksLikeLocale(pathname: string): boolean {
  const segment = pathname.split('/')[1] ?? ''
  return /^[a-z]{2}(-[a-z]{2})?$/.test(segment)
}

/** The first path segment when it names a locale, otherwise null. */
export function localeFromPath(pathname: string): Locale | null {
  const segment = pathname.split('/')[1]
  return isLocale(segment) ? segment : null
}

/**
 * `/ru/blog/x` -> `/blog/x`. A first segment that is not a locale is left
 * alone, so this is safe to call on any path.
 */
export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname)
  if (!locale) return pathname
  return pathname.slice(locale.length + 1) || '/'
}

/**
 * Minimal Accept-Language parse. Negotiator plus intl-localematcher is ~40 kB
 * of Edge bundle to choose between two languages; ranking the tags by `q` and
 * taking the first supported primary subtag is enough.
 */
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      const weight = q ? Number.parseFloat(q.split('=')[1]) : 1
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(weight) ? weight : 0 }
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    if (tag === '*') return defaultLocale
    const base = tag.split('-')[0] // ru-RU -> ru
    if (isLocale(base)) return base
  }

  return null
}

/**
 * An explicit choice outranks the browser: a reader who picked Russian should
 * keep landing on Russian even from an English-configured browser.
 */
export function pickLocale(cookie: string | undefined, header: string | null): Locale {
  if (isLocale(cookie)) return cookie
  return fromAcceptLanguage(header) ?? defaultLocale
}
