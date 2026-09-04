import Link from 'next/link'

import { UserMenu } from '@/components/user-menu'
import { articleLocaleMap } from '@/content/blog/registry'
import { type Locale } from '@/lib/i18n/config'
import { localeHref } from '@/lib/i18n/urls'
import type { Dictionary } from '@/lib/i18n/dictionaries'

interface SiteHeaderProps {
  locale: Locale
  dict: Dictionary['nav']
}

export function SiteHeader({ locale, dict }: SiteHeaderProps) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <nav className="flex items-center gap-6 text-sm">
          <Link href={localeHref(locale, '/')} className="font-medium">
            Unitcore
          </Link>
          <Link
            href={localeHref(locale, '/blog')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {dict.blog}
          </Link>
        </nav>
        <UserMenu dict={dict} articleLocales={articleLocaleMap()} />
      </div>
    </header>
  )
}
