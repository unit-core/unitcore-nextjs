import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup } from '@/components/ui/item'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { type RecentItem } from '@/lib/budget/dashboard'
import { formatDay, formatMoney } from '@/lib/budget/format'
import { type Locale } from '@/lib/i18n/config'
import { type Dictionary } from '@/lib/i18n/dictionaries'

/**
 * The latest entries, listed one line each.
 *
 * These are transaction *items*, not transactions: the signed view carries no
 * transaction title, and the item's own name is the more useful label anyway
 * ("bread" rather than "Supermarket"). Reading them from the same window the
 * cards were built from keeps the whole page on one query.
 */
export function RecentTransactions({
  locale,
  dict,
  items,
}: {
  locale: Locale
  dict: Dictionary['dashboard']
  items: RecentItem[]
}) {
  return (
    <DashboardCard>
      <CardHeader>
        <CardTitle>{dict.recent}</CardTitle>
        <CardDescription>{dict.recentDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {items.map((item) => (
            <Item key={item.id} variant="muted" className="rounded-2xl px-4 py-3">
              <ItemContent className="gap-0.5">
                <span className="truncate text-sm font-medium">{item.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {/* Category and date on one caption line: two more columns
                      would push the amount off a narrow card. */}
                  {(item.category ?? dict.uncategorized) + ' · ' + formatDay(locale, item.occurredAt)}
                </span>
              </ItemContent>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatMoney(locale, item.currency, item.amount, { cents: true })}
              </span>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </DashboardCard>
  )
}
