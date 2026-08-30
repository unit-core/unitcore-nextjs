import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { lang } from 'next/root-params'

import { getArticle, listArticleParams } from '@/content/blog/registry'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { articleUrl, localeHref } from '@/lib/i18n/urls'

// Only pairs that actually have content, so every real article is prerendered.
export function generateStaticParams() {
  return listArticleParams()
}

// Overrides the `dynamicParams = false` inherited from the [lang] root layout,
// for this segment only. Without it an unknown or untranslated slug 404s at the
// routing layer, before the [lang] layout runs, and Next serves its bare
// built-in 404 — no header, no styling, no language. Letting the segment render
// means getArticle() returns null, notFound() runs, and blog/not-found.tsx
// answers in the reader's language. The status is still 404, so nothing changes
// for crawlers, and hreflang still lists only real translations.
export const dynamicParams = true

export async function generateMetadata(
  props: PageProps<'/[lang]/blog/[slug]'>
): Promise<Metadata> {
  const { lang: locale, slug } = await props.params
  const article = await getArticle(slug, locale)
  if (!article) return {}

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: articleUrl(article.locale, slug),
      languages: {
        ...Object.fromEntries(
          article.availableLocales.map((l) => [l, articleUrl(l, slug)])
        ),
        ...(article.availableLocales.includes('en')
          ? { 'x-default': articleUrl('en', slug) }
          : {}),
      },
    },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.description,
      url: articleUrl(article.locale, slug),
      locale: article.locale === 'ru' ? 'ru_RU' : 'en_US',
      publishedTime: article.date,
      modifiedTime: article.updated ?? article.date,
      siteName: 'unitcore',
    },
  }
}

export default async function ArticlePage(props: PageProps<'/[lang]/blog/[slug]'>) {
  const { slug } = await props.params
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const article = await getArticle(slug, locale)
  if (!article) notFound()

  const dict = await getDictionary()
  const { Content } = article

  return (
    <article>
      <header className="mb-10 flex flex-col gap-4">
        <Link
          href={localeHref(locale, '/blog')}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {dict.blog.backToIndex}
        </Link>
        <h1 className="text-4xl font-semibold tracking-tight">{article.title}</h1>
        <time dateTime={article.date} className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(article.date))}
        </time>
      </header>

      <div className="prose prose-lg max-w-none">
        <Content />
      </div>
    </article>
  )
}
