import { notFound, redirect } from 'next/navigation'
import { lang } from 'next/root-params'

import { LogoutButton } from '@/components/logout-button'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { localeHref } from '@/lib/i18n/urls'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    redirect(localeHref(locale, '/auth/login'))
  }

  const dict = await getDictionary()

  return (
    <div className="flex h-svh w-full items-center justify-center gap-2">
      <p>
        Hello <span>{data.claims.email}</span>
      </p>
      <LogoutButton label={dict.auth.logout} />
    </div>
  )
}
