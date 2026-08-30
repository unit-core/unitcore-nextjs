'use client'

import { usePathname } from 'next/navigation'

import { defaultLocale, localeFromPath, type Locale } from '@/lib/i18n/config'

/**
 * Client components cannot read `next/root-params`, and threading the locale
 * through every form as a prop would touch a lot of call sites for one value.
 * Every localized page lives under /{locale}/, so the pathname already carries
 * it.
 */
export function useLocale(): Locale {
  return localeFromPath(usePathname()) ?? defaultLocale
}
