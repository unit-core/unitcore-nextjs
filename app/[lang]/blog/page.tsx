import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'

import { ArticleCard } from '@/components/blog/article-card'
import { listArticles } from '@/content/blog/registry'
import { isLocale, locales } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { blogIndexUrl } from '@/lib/i18n/urls'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await lang()
  if (!isLocale(locale)) return {}
  const dict = await getDictionary()

  return {
    title: dict.blog.title,
    description: dict.blog.subtitle,
    alternates: {
      canonical: blogIndexUrl(locale),
      languages: {
        ...Object.fromEntries(locales.map((l) => [l, blogIndexUrl(l)])),
        'x-default': blogIndexUrl('en'),
      },
    },
  }
}

export default async function BlogIndexPage() {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()
  const articles = listArticles(locale)

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{dict.blog.title}</h1>
      <p className="mt-3 text-muted-foreground">{dict.blog.subtitle}</p>

      {articles.length === 0 ? (
        <p className="mt-10 text-muted-foreground">{dict.blog.empty}</p>
      ) : (
        <ul className="mt-10 flex flex-col gap-6">
          {articles.map((article) => (
            <li key={article.slug}>
              <ArticleCard article={article} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
