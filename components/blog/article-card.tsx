import Link from 'next/link'

import type { ArticleSummary } from '@/content/blog/registry'
import { localeHref } from '@/lib/i18n/urls'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <Link href={localeHref(article.locale, `/blog/${article.slug}`)} className="block">
      <Card className="transition-colors hover:border-foreground/25">
        <CardHeader>
          <CardTitle className="text-xl">{article.title}</CardTitle>
          <CardDescription>{article.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <time dateTime={article.date} className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat(article.locale, { dateStyle: 'long' }).format(
              new Date(article.date)
            )}
          </time>
        </CardContent>
      </Card>
    </Link>
  )
}
