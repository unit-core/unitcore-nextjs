import { type EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'

import { LOCALE_COOKIE, localeFromPath, pickLocale } from '@/lib/i18n/config'
import { localeHref } from '@/lib/i18n/urls'
import { createClient } from '@/lib/supabase/server'

/**
 * Stays outside [lang]: this URL is baked into confirmation emails already in
 * people's inboxes, and a Route Handler has no UI to translate. `next/root-params`
 * is unavailable here, so the locale comes from the cookie the switcher sets.
 */
async function currentLocale(request: NextRequest) {
  const cookieStore = await cookies()
  return pickLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    request.headers.get('accept-language')
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const _next = searchParams.get('next')
  const locale = await currentLocale(request)

  // The sign-up form already sends a locale-prefixed `next`; anything else
  // falls back to the reader's language rather than to an unprefixed path,
  // which would only bounce through the proxy again.
  const next =
    _next?.startsWith('/') && localeFromPath(_next) ? _next : localeHref(locale, '/')

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next)
    } else {
      // redirect the user to an error page with some instructions
      redirect(localeHref(locale, `/auth/error?error=${error?.message}`))
    }
  }

  // redirect the user to an error page with some instructions
  redirect(localeHref(locale, `/auth/error?error=No token hash or type`))
}
