import { type Locale } from '@/lib/i18n/config'

/**
 * The apex is canonical: vercel.json redirects www to it permanently.
 * hreflang values must be absolute, so URLs are built explicitly rather than
 * leaning on metadataBase plus relative paths.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://unitcore.io'

/** `/protected` -> `/ru/protected`. Takes an unprefixed, absolute-ish path. */
export function localeHref(locale: Locale, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`
}

export const siteUrl = (locale: Locale, path = '/') => `${SITE_URL}${localeHref(locale, path)}`

export const blogIndexUrl = (locale: Locale) => siteUrl(locale, '/blog')

export const articleUrl = (locale: Locale, slug: string) => siteUrl(locale, `/blog/${slug}`)
