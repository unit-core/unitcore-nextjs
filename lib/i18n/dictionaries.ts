import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { isLocale } from '@/lib/i18n/config'

const dictionaries = {
  en: () => import('@/dictionaries/en.json').then((m) => m.default),
  ru: () => import('@/dictionaries/ru.json').then((m) => m.default),
}

/**
 * The shape is inferred from the English dictionary, so TypeScript fails the
 * build if a key is missing from a translation. An untranslated string is
 * therefore an English value sitting in ru.json — visible and greppable —
 * rather than a hole that shows up as `undefined` at runtime.
 */
export type Dictionary = Awaited<ReturnType<typeof dictionaries.en>>

/**
 * Resolves the locale itself, so callers do not pass it. Server Components
 * only: `next/root-params` is unavailable in Client Components, Server Actions
 * and Route Handlers.
 */
export async function getDictionary(): Promise<Dictionary> {
  const locale = await lang()
  if (!isLocale(locale)) notFound()
  return dictionaries[locale]()
}
