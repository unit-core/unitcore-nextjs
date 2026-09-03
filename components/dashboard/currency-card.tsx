import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Item, ItemContent } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { MonthBars } from '@/components/dashboard/month-bars'
import { type CurrencyWidget } from '@/lib/budget/dashboard'
import { formatMoney, formatMonth, percentChange } from '@/lib/budget/format'
import { type Locale } from '@/lib/i18n/config'
import { type Dictionary } from '@/lib/i18n/dictionaries'
import { fill } from '@/lib/i18n/interpolate'

/**
 * One currency, one card — the shape the whole dashboard is built around.
 *
 * Currencies are never added together: there is no FX rate anywhere in this
 * project, so a combined "total spent" would be a made-up number. Each card
 * answers the same four questions for its own currency: how much this month,
 * against last month, spread over six months, split by category.
 */
export function CurrencyCard({
  locale,
  dict,
  widget,
  monthStart,
}: {
  locale: Locale
  dict: Dictionary['dashboard']
  widget: CurrencyWidget
  monthStart: string
}) {
  const change = percentChange(widget.total, widget.previousTotal)

  const label = (slice: CurrencyWidget['categories'][number]) =>
    slice.kind === 'named' ? (slice.name ?? '') : slice.kind === 'other' ? dict.other : dict.uncategorized

  return (
    <DashboardCard>
      <CardHeader>
        {/* Description above title: the amount is the headline, and the period
            is the caption that qualifies it. Same inversion shadcn.com uses on
            its balance card. */}
        <CardDescription>{fill(dict.spentIn, { month: formatMonth(locale, monthStart) })}</CardDescription>
        <CardTitle className="text-4xl tabular-nums">
          {formatMoney(locale, widget.currency, widget.total)}
        </CardTitle>
        {change === null ? (
          <Badge variant="outline" className="mt-1 text-muted-foreground">
            {dict.noPrevious}
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-1">
            <span
              className={`size-2 rounded-full ${change > 0 ? 'bg-destructive' : 'bg-emerald-500'}`}
              aria-hidden
            />
            {fill(dict.vsPrevious, {
              // Spending more is the bad direction, so the sign is written out
              // rather than left to the reader to infer from a colour alone.
              change: `${change > 0 ? '+' : ''}${Math.round(change)}%`,
            })}
          </Badge>
        )}
      </CardHeader>

      <CardContent>
        <MonthBars locale={locale} currency={widget.currency} months={widget.months} />
      </CardContent>

      <CardContent>
        {widget.categories.length === 0 ? (
          <Item variant="muted" className="rounded-2xl px-4 py-3.5 text-muted-foreground">
            {dict.noSpendingThisMonth}
          </Item>
        ) : (
          <Item variant="muted" className="flex-col items-stretch gap-3 rounded-2xl px-4 py-3.5">
            <ItemContent className="gap-3">
              {widget.categories.map((slice) => (
                <div key={`${slice.kind}:${slice.name ?? ''}`} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-muted-foreground">{label(slice)}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatMoney(locale, widget.currency, slice.total)}
                    </span>
                  </div>
                  <Progress
                    value={Math.round(slice.share * 100)}
                    aria-label={label(slice)}
                    className="gap-0"
                  />
                </div>
              ))}
            </ItemContent>
          </Item>
        )}
      </CardContent>
    </DashboardCard>
  )
}
