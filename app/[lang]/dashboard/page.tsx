import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'
import { WalletMinimal } from 'lucide-react'

import { AddTransaction } from '@/components/dashboard/add-transaction'
import { CurrencyCard } from '@/components/dashboard/currency-card'
import { RecentTransactions } from '@/components/dashboard/recent-transactions'
import { SpaceFilter } from '@/components/dashboard/space-filter'
import { TasksCard } from '@/components/dashboard/tasks-card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { getDashboardData } from '@/lib/budget/dashboard'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

// No middleware entry is needed, and none should be added: /dashboard is absent
// from PUBLIC_PREFIXES in lib/supabase/middleware.ts, so an unauthenticated
// visitor is already sent to /{locale}/auth/login. That same file sends a signed
// in visitor here from the landing page.
export default async function DashboardPage(props: PageProps<'/[lang]/dashboard'>) {
  const locale = await lang()
  if (!isLocale(locale)) notFound()

  const dict = await getDictionary()
  const { space } = await props.searchParams
  const spaceId = typeof space === 'string' ? space : undefined

  const { currencies, recent, monthStart } = await getDashboardData({ spaceId })
  const isEmpty = currencies.length === 0

  return (
    <main className="flex-1 bg-muted px-4 py-6 sm:px-6 lg:px-8 lg:py-8 dark:bg-background">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{dict.dashboard.title}</h1>
          {/* useSearchParams needs a suspense boundary; the filter is the only
              client island on the page, so the rest still renders on the server. */}
          <Suspense fallback={null}>
            <SpaceFilter dict={dict.dashboard} />
          </Suspense>
        </div>

        {/* items-start keeps every card at its own height instead of stretching
            the short ones to match the tallest in the row — the loose, uneven
            tiling the shadcn.com landing page is built out of.

            The tasks card sits in the same grid whether or not there is a budget
            to total up: the two products share a dashboard but not a reason to
            be empty, and an account with tasks and no transactions should see
            its tasks rather than only an invitation to connect an assistant. */}
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          {isEmpty ? (
            <Empty className="rounded-[min(var(--radius-4xl),24px)] bg-card py-16 shadow-sm ring-1 ring-foreground/5 md:col-span-1 xl:col-span-2 dark:ring-foreground/10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletMinimal />
                </EmptyMedia>
                <EmptyTitle>{dict.dashboard.empty.title}</EmptyTitle>
                <EmptyDescription>{dict.dashboard.empty.description}</EmptyDescription>
              </EmptyHeader>
              {/* The way out of an empty dashboard is to write something in it.
                  Connecting an assistant is the other way, and it lives in
                  settings: offering it here made the page's own answer to "how
                  do I record a transaction" a link away from the page. */}
              <EmptyContent>
                <AddTransaction dict={dict.dashboard} spaceId={spaceId} />
              </EmptyContent>
            </Empty>
          ) : (
            <>
              {currencies.map((widget) => (
                <CurrencyCard
                  key={widget.currency}
                  locale={locale}
                  dict={dict.dashboard}
                  widget={widget}
                  monthStart={monthStart}
                  spaceId={spaceId}
                />
              ))}
              {recent.length > 0 && (
                <RecentTransactions locale={locale} dict={dict.dashboard} items={recent} />
              )}
            </>
          )}

          <TasksCard spaceId={spaceId} locale={locale} dict={dict.tasks} />
        </div>
      </div>
    </main>
  )
}
