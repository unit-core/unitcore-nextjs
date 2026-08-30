import type { MetadataRoute } from 'next'

import { listArticles } from '@/content/blog/registry'
import { locales } from '@/lib/i18n/config'
import { articleUrl, blogIndexUrl, siteUrl } from '@/lib/i18n/urls'

/** Public, indexable paths that exist in every locale. */
const STATIC_PATHS = ['/', '/blog'] as const

// A Route Handler, so `next/root-params` is unavailable here: the locales come
// from the config and the articles from the registry.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = locales.flatMap((locale) =>
    STATIC_PATHS.map((path) => ({
      url: path === '/blog' ? blogIndexUrl(locale) : siteUrl(locale, path),
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.6,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, path === '/blog' ? blogIndexUrl(l) : siteUrl(l, path)])
        ),
      },
    }))
  )

  const articleEntries = locales.flatMap((locale) =>
    listArticles(locale).map((article) => ({
      url: articleUrl(locale, article.slug),
      lastModified: new Date(article.updated ?? article.date),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: {
        languages: Object.fromEntries(
          article.availableLocales.map((l) => [l, articleUrl(l, article.slug)])
        ),
      },
    }))
  )

  return [...staticEntries, ...articleEntries]
}
