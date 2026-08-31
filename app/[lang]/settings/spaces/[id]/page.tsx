import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { SpaceDetail } from '@/components/space-detail'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

/**
 * The section name, not the space name. Reading the space here would mean a
 * server-side query for a title the browser tab shows to whoever is looking
 * over the reader's shoulder — and the name is private data of a space the
 * visitor may not even be a member of.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary()
  return { title: dict.settings.spaces.title }
}

export default async function SpacePage(props: PageProps<'/[lang]/settings/spaces/[id]'>) {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const { id } = await props.params
  const dict = await getDictionary()

  return <SpaceDetail spaceId={id} dict={dict.settings.spaces} />
}
