import type { MDXProps } from 'mdx/types'
import type { JSX } from 'react'

import { isLocale, locales, type Locale } from '@/lib/i18n/config'

type MDXContent = (props: MDXProps) => JSX.Element

export interface Translation {
  title: string
  description: string
  load: () => Promise<{ default: MDXContent }>
}

export interface Article {
  slug: string
  /** ISO date of first publication, shared across locales. */
  date: string
  updated?: string
  tags: readonly string[]
  draft?: boolean
  /**
   * Partial on purpose: an article may exist in one language before the other.
   * That is what makes "not translated yet" a state the type system forces
   * every caller to handle.
   */
  translations: Partial<Record<Locale, Translation>>
}

/**
 * An explicit registry rather than a bundler glob: every article and every
 * translation is a static import path a human can grep for, titles are readable
 * without compiling MDX, and TypeScript proves the shape. Same trade-off as the
 * dictionaries pattern in the Next.js i18n guide.
 */
const articles: readonly Article[] = [
  {
    slug: 'chatgpt-setup',
    date: '2026-09-02',
    tags: ['mcp', 'setup', 'oauth', 'chatgpt'],
    translations: {
      en: {
        title: 'Connect Unitcore to ChatGPT',
        description:
          'Developer mode, a custom MCP app, and the one choice the consent screen asks you to make — what ChatGPT may and may not do with your budget once it is connected.',
        load: () => import('./chatgpt-setup/en.mdx'),
      },
      ru: {
        title: 'Подключите Unitcore к ChatGPT',
        description:
          'Режим разработчика, своё MCP-приложение и единственный выбор, который делает за вас экран согласия, — что ChatGPT может и не может делать с вашим бюджетом после подключения.',
        load: () => import('./chatgpt-setup/ru.mdx'),
      },
    },
  },
  {
    slug: 'unitcore-setup',
    date: '2026-08-31',
    tags: ['mcp', 'setup', 'oauth', 'claude'],
    translations: {
      en: {
        title: 'Connect Unitcore to Claude',
        description:
          'A step-by-step setup, the one OAuth setting that trips people up, and what Claude can and cannot do with your budget once it is connected.',
        load: () => import('./unitcore-setup/en.mdx'),
      },
      ru: {
        title: 'Подключите Unitcore к Claude',
        description:
          'Пошаговая настройка, единственная настройка OAuth, на которой все спотыкаются, и что Claude может и не может делать с вашим бюджетом после подключения.',
        load: () => import('./unitcore-setup/ru.mdx'),
      },
    },
  },
  {
    slug: 'product-structure',
    date: '2026-08-30',
    tags: ['spaces', 'product', 'claude'],
    translations: {
      en: {
        title: 'How Unitcore is put together',
        description:
          'One account, several spaces, the same modules inside each one — the shape of the product, and why personal and shared never mix.',
        load: () => import('./product-structure/en.mdx'),
      },
      ru: {
        title: 'Как устроен Unitcore',
        description:
          'Один аккаунт, несколько пространств, одни и те же модули в каждом — из чего собран продукт и почему личное не смешивается с общим.',
        load: () => import('./product-structure/ru.mdx'),
      },
    },
  },
]

const bySlug = new Map(articles.map((article) => [article.slug, article]))

const isPublished = (article: Article) =>
  article.draft !== true || process.env.NODE_ENV !== 'production'

export interface ArticleSummary {
  slug: string
  locale: Locale
  title: string
  description: string
  date: string
  updated?: string
  tags: readonly string[]
  /** Locales this article really exists in, in `locales` order. */
  availableLocales: Locale[]
}

/** Locales `slug` is translated into. Empty for an unknown or draft slug. */
export function getTranslations(slug: string): Locale[] {
  const article = bySlug.get(slug)
  if (!article || !isPublished(article)) return []
  return locales.filter((locale) => article.translations[locale] !== undefined)
}

function summarize(article: Article, locale: Locale): ArticleSummary | null {
  const translation = article.translations[locale]
  if (!translation) return null
  return {
    slug: article.slug,
    locale,
    title: translation.title,
    description: translation.description,
    date: article.date,
    updated: article.updated,
    tags: article.tags,
    availableLocales: getTranslations(article.slug),
  }
}

/** Published articles that exist in `locale`, newest first. */
export function listArticles(locale: Locale): ArticleSummary[] {
  return articles
    .filter(isPublished)
    .map((article) => summarize(article, locale))
    .filter((summary): summary is ArticleSummary => summary !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface LoadedArticle extends ArticleSummary {
  Content: MDXContent
}

/** Compiled MDX for one article in one locale, or null if that pair has none. */
export async function getArticle(
  slug: string,
  locale: string
): Promise<LoadedArticle | null> {
  if (!isLocale(locale)) return null

  const article = bySlug.get(slug)
  if (!article || !isPublished(article)) return null

  const translation = article.translations[locale]
  if (!translation) return null

  const summary = summarize(article, locale)
  if (!summary) return null

  const { default: Content } = await translation.load()
  return { ...summary, Content }
}

/**
 * Every (lang, slug) pair that has content. Feeding this to
 * generateStaticParams, with dynamicParams = false above, is what makes an
 * untranslated article a 404 at the routing layer instead of a runtime branch.
 */
export function listArticleParams(): { lang: Locale; slug: string }[] {
  return articles.filter(isPublished).flatMap((article) =>
    locales
      .filter((locale) => article.translations[locale] !== undefined)
      .map((locale) => ({ lang: locale, slug: article.slug }))
  )
}

/**
 * slug -> locales it exists in. Small and static, so the header's language
 * switcher can be handed it and never offer a link to an article that was
 * never translated.
 */
export function articleLocaleMap(): Record<string, Locale[]> {
  return Object.fromEntries(
    articles.filter(isPublished).map((article) => [article.slug, getTranslations(article.slug)])
  )
}
