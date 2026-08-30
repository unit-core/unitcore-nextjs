import Link from 'next/link'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { localeHref } from '@/lib/i18n/urls'

export default async function BlogNotFound() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()
  const dict = await getDictionary()

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{dict.blog.notFoundTitle}</h1>
      <p className="text-muted-foreground">{dict.blog.notFoundBody}</p>
      <Link href={localeHref(locale, '/blog')} className="underline underline-offset-4">
        {dict.blog.backToIndex}
      </Link>
    </div>
  )
}
