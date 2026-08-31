import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { SpacesList } from '@/components/spaces-list'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return { title: dict.settings.spaces.title }
}

export default async function SpacesPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()

  return (
    <>
      <header className="mt-8 mb-8 space-y-2">
        <h1 className="text-2xl font-medium">{dict.settings.spaces.title}</h1>
        <p className="text-muted-foreground">{dict.settings.spaces.subtitle}</p>
      </header>
      <SpacesList dict={dict.settings.spaces} />
    </>
  )
}
