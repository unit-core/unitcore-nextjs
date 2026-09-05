'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup } from '@/components/ui/item'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { TransactionDialog } from '@/components/dashboard/transaction-dialog'
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
 *
 * A row opens the transaction it belongs to rather than the line itself. The
 * line has no date, no currency and no space of its own — those live on the
 * parent and are pushed down by a trigger — so a form for one line alone could
 * only ever change half of what somebody meant to correct.
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
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <DashboardCard>
      <CardHeader>
        <CardTitle>{dict.recent}</CardTitle>
        <CardDescription>{dict.recentDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {items.map((item) => (
            <Item
              key={item.id}
              variant="muted"
              className="rounded-2xl px-4 py-3 transition-colors hover:bg-muted/80"
              render={
                <button
                  type="button"
                  onClick={() => setOpenId(item.transactionId)}
                  className="w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
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

      {/* One dialog for the whole list, told which transaction to load. Mounting
          one per row would be eight dialogs waiting for a click that goes to at
          most one of them. */}
      <TransactionDialog
        dict={dict}
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
        transactionId={openId}
        onSaved={() => {
          setOpenId(null)
          router.refresh()
        }}
      />
    </DashboardCard>
  )
}
