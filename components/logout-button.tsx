'use client'

import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { Button } from '@/components/ui/button'

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter()
  const locale = useLocale()

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(localeHref(locale, '/auth/login'))
  }

  return <Button onClick={logout}>{label}</Button>
}
