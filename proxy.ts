import { NextResponse, type NextRequest } from 'next/server'

import { LOCALE_COOKIE, looksLikeLocale, pickLocale } from '@/lib/i18n/config'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Paths that must never gain a locale prefix. The first four are machine
 * endpoints — an MCP client, a Supabase confirmation link and the OAuth
 * discovery document cannot follow a redirect to a translated page — and the
 * last two are crawler documents that live at fixed, unprefixed URLs.
 */
const UNLOCALIZED = ['/api', '/.well-known', '/auth/confirm', '/robots.txt', '/sitemap.xml']

const isUnlocalized = (pathname: string) =>
  UNLOCALIZED.some((path) => pathname === path || pathname.startsWith(`${path}/`))

// Next.js 16 renamed middleware to proxy and requires the export to be named
// `proxy` (or be the default export); the registry block still ships the old name.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Every page lives under /{locale}/. Sending unprefixed paths to the reader's
  // language keeps old bookmarks, and the OAuth consent URL registered with
  // Supabase, working — query strings survive the redirect.
  // `looksLikeLocale` rather than `localeFromPath`: /fr/blog already carries a
  // locale, just not one we have. Prefixing it would produce /en/fr/blog and an
  // indexable soft 404; letting it through lets dynamicParams = false answer 404.
  if (!isUnlocalized(pathname) && !looksLikeLocale(pathname)) {
    const locale = pickLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get('accept-language')
    )
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`

    const response = NextResponse.redirect(url)
    // The destination depends on a header and a cookie; without this a shared
    // cache would pin one language for everyone.
    response.headers.set('Vary', 'Accept-Language, Cookie')
    return response
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api/mcp and .well-known - bearer-token endpoints, must not redirect
     * - robots.txt and sitemap.xml - crawler documents, must not redirect
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/mcp|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
