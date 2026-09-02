import Link from 'next/link'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { buttonVariants } from '@/components/ui/button'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { localeHref } from '@/lib/i18n/urls'

export default async function HomePage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()
  const dict = await getDictionary()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Unitcore</h1>
      <p className="text-lg text-muted-foreground">{dict.home.tagline}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={localeHref(locale, '/auth/login')} className={buttonVariants()}>
          {dict.nav.signIn}
        </Link>
        <Link
          href={localeHref(locale, '/blog')}
          className={buttonVariants({ variant: 'outline' })}
        >
          {dict.nav.blog}
        </Link>
      </div>
    </main>
  )
}
