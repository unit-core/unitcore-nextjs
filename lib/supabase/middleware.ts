import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  LOCALE_COOKIE,
  localeFromPath,
  pickLocale,
  looksLikeLocale,
  stripLocale,
  type Locale,
} from '@/lib/i18n/config'

/**
 * Paths that must answer without a session.
 *
 * Matched against the path with its locale prefix removed, so /en/blog and
 * /ru/blog both land here and a third language needs no change. Listing the
 * prefixed forms instead is how a public page quietly ends up behind the login
 * wall the day a locale is added.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  // the OAuth consent route sends unauthenticated visitors to the login page
  // itself, so that it can preserve the authorization in the `next` parameter
  '/oauth/consent',
  // the MCP endpoint and the OAuth discovery documents authenticate with
  // bearer tokens rather than cookies, so they must answer 401/JSON instead
  // of redirecting: an MCP client cannot follow a redirect to a login form
  '/api/mcp',
  '/.well-known',
  // marketing content: the landing page and the articles
  '/blog',
]

const PUBLIC_EXACT = new Set([
  '/',
  // a crawler that gets redirected to a login form indexes nothing
  '/robots.txt',
  '/sitemap.xml',
])

function isPublicPath(pathname: string) {
  // An unsupported language tag has to reach the router so it can answer 404.
  // Sending it to the login form instead would return 200 on a URL that does
  // not exist, which is exactly the soft 404 crawlers punish.
  if (!localeFromPath(pathname) && looksLikeLocale(pathname)) return true

  const path = stripLocale(pathname)
  if (PUBLIC_EXACT.has(path)) return true
  // Compared segment-wise: a prefix test alone would make /authorize-me public.
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Keeps the login form in the language the visitor was already reading. */
function localeFor(request: NextRequest): Locale {
  return (
    localeFromPath(request.nextUrl.pathname) ??
    pickLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get('accept-language')
    )
  )
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = `/${localeFor(request)}/auth/login`
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
