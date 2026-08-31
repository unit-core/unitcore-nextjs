import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { OAuthConnections } from '@/components/oauth-connections'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return { title: dict.settings.connections.title }
}

// No middleware entry is needed, and none should be added: /settings is absent
// from PUBLIC_PREFIXES in lib/supabase/middleware.ts, so an unauthenticated
// visitor is already sent to /{locale}/auth/login.
export default async function ConnectionsPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-medium">{dict.settings.connections.title}</h1>
        <p className="text-muted-foreground">{dict.settings.connections.subtitle}</p>
      </header>
      <OAuthConnections dict={dict.settings.connections} />
    </main>
  )
}
