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

// The <main> wrapper and the section tabs live in the layout one level up,
// which also carries the note about why no middleware entry is needed.
export default async function ConnectionsPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()

  return (
    <>
      <header className="mt-8 mb-8 space-y-2">
        <h1 className="text-2xl font-medium">{dict.settings.connections.title}</h1>
        <p className="text-muted-foreground">{dict.settings.connections.subtitle}</p>
      </header>
      <OAuthConnections dict={dict.settings.connections} />
    </>
  )
}
