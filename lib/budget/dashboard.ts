import { createClient } from '@/lib/supabase/server'

/** How many months the bar chart on each currency card covers, current one included. */
export const MONTHS_IN_CHART = 6

/** Categories listed by name on a card; the rest collapse into one "other" row. */
const TOP_CATEGORIES = 5

/** Rows shown by the recent-transactions widget. */
const RECENT_LIMIT = 8

/**
 * PostgREST answers with at most 1000 rows per request regardless of `.limit()`,
 * so a half-year window has to be paged rather than asked for in one go. It is
 * the same ceiling `summary` in lib/mcp/tools.ts quietly runs into.
 */
const PAGE_SIZE = 1000

/**
 * One item of one transaction, read from `budget.transaction_items_signed`.
 *
 * The view left-joins the category, so an uncategorized item arrives with
 * `category_name`, `category_kind` and `signed_amount` all null — see the note
 * on `isExpense` below. `amount` is `numeric(14,4)`, and PostgREST serialises
 * numerics as strings, so every read goes through `Number()`.
 */
interface ItemRow {
  id: string
  name: string
  amount: string | number
  currency_code: string
  occurred_at: string
  category_name: string | null
  category_kind: 'expense' | 'income' | null
  space_id: string
}

export interface CategorySlice {
  /**
   * `named` carries `name`; `uncategorized` is the items with no category at
   * all, `other` is the tail past TOP_CATEGORIES. The last two are separate
   * kinds rather than a shared null `name`: they mean different things and the
   * dictionary labels them differently.
   */
  kind: 'named' | 'uncategorized' | 'other'
  name: string | null
  total: number
  /** Bar width, 0..1 — relative to the largest row, not to the month's total. */
  share: number
}

export interface MonthPoint {
  /** First day of the month, ISO, UTC — the UI formats it for the locale. */
  month: string
  total: number
}

export interface CurrencyWidget {
  currency: string
  /** Spend in the current month. */
  total: number
  /** Spend in the month before, for the delta badge. */
  previousTotal: number
  categories: CategorySlice[]
  /** Oldest to newest, always MONTHS_IN_CHART long — empty months included. */
  months: MonthPoint[]
}

export interface RecentItem {
  id: string
  name: string
  category: string | null
  amount: number
  currency: string
  occurredAt: string
}

export interface DashboardData {
  /** One per currency seen in the window, biggest current-month spend first. */
  currencies: CurrencyWidget[]
  recent: RecentItem[]
  /** First day of the current month, ISO, UTC — the UI turns it into a month name. */
  monthStart: string
}

/**
 * An uncategorized item counts as spending.
 *
 * `category_kind` is null for it, so a plain `=== 'expense'` test would drop the
 * money from the total and leave a dashboard that quietly under-reports. Income
 * is the only thing that has to be named explicitly to be excluded, which also
 * matches the schema: a category is created as expense or income, and money with
 * no category attached is money that left the account.
 *
 * This is deliberately more inclusive than `summary` in lib/mcp/tools.ts, which
 * files those rows under a third kind and leaves them out of `totals.expense`.
 */
const isExpense = (row: ItemRow) => row.category_kind !== 'income'

/** First instant of the month `offset` months away from `from`, in UTC. */
function monthStart(from: Date, offset = 0): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1))
}

/**
 * Reads every row of the window, a page at a time.
 *
 * Ordering by `occurred_at` alone is not enough to page safely — rows sharing a
 * timestamp could shuffle between requests and be seen twice or not at all — so
 * `id` breaks the tie and makes the order total.
 */
async function fetchWindow(from: Date, to: Date, spaceId?: string): Promise<ItemRow[]> {
  const supabase = await createClient()
  const rows: ItemRow[] = []

  for (let page = 0; ; page += 1) {
    let query = supabase
      .schema('budget')
      .from('transaction_items_signed')
      .select('id, name, amount, currency_code, occurred_at, category_name, category_kind, space_id')
      // Half-open on purpose: `occurred_at` is timestamptz, so `lte` against a
      // bare date compares with midnight and swallows the whole last day.
      .gte('occurred_at', from.toISOString())
      .lt('occurred_at', to.toISOString())
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    // Without a space the filter is simply absent: the view is security_invoker,
    // so RLS has already narrowed the rows to spaces this reader belongs to.
    if (spaceId) query = query.eq('space_id', spaceId)

    const { data, error } = await query.returns<ItemRow[]>()
    if (error) throw new Error(error.message)

    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * Everything the dashboard renders, from a single read of the last
 * MONTHS_IN_CHART months. Aggregating here rather than in SQL keeps the whole
 * feature out of the database: there is no summary RPC today, and
 * supabase/checks/security-invariants.sql forbids adding a security definer one
 * that returns rows.
 */
export async function getDashboardData({ spaceId }: { spaceId?: string } = {}): Promise<DashboardData> {
  const now = new Date()
  const current = monthStart(now)
  const previous = monthStart(now, -1)
  const windowStart = monthStart(now, -(MONTHS_IN_CHART - 1))
  const windowEnd = monthStart(now, 1)

  const rows = await fetchWindow(windowStart, windowEnd, spaceId)

  const months: string[] = []
  for (let i = MONTHS_IN_CHART - 1; i >= 0; i -= 1) {
    months.push(monthStart(now, -i).toISOString())
  }

  const byCurrency = new Map<
    string,
    { total: number; previousTotal: number; categories: Map<string | null, number>; months: Map<string, number> }
  >()

  for (const row of rows) {
    if (!isExpense(row)) continue

    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) continue

    const bucket =
      byCurrency.get(row.currency_code) ??
      { total: 0, previousTotal: 0, categories: new Map(), months: new Map() }
    byCurrency.set(row.currency_code, bucket)

    const at = new Date(row.occurred_at)
    const month = monthStart(at).toISOString()
    bucket.months.set(month, (bucket.months.get(month) ?? 0) + amount)

    if (at >= current) {
      bucket.total += amount
      bucket.categories.set(row.category_name, (bucket.categories.get(row.category_name) ?? 0) + amount)
    } else if (at >= previous) {
      bucket.previousTotal += amount
    }
  }

  const currencies: CurrencyWidget[] = [...byCurrency.entries()]
    .map(([currency, bucket]) => {
      const sorted = [...bucket.categories.entries()].sort((a, b) => b[1] - a[1])
      const head = sorted.slice(0, TOP_CATEGORIES)
      const rest = sorted.slice(TOP_CATEGORIES).reduce((sum, [, value]) => sum + value, 0)

      const rows: Omit<CategorySlice, 'share'>[] = head.map(([name, total]) => ({
        kind: name === null ? ('uncategorized' as const) : ('named' as const),
        name,
        total,
      }))
      // The tail is one row, and it is not the same thing as an item filed under
      // no category — a long tail can even outweigh the biggest named category.
      if (rest > 0) rows.push({ kind: 'other', name: null, total: rest })

      // Bars are scaled to the largest row rather than to the month's total, so
      // the top one always fills the width: split six ways, every bar would sit
      // under a sixth of the row and read as noise instead of as a comparison.
      const largest = rows.reduce((max, row) => Math.max(max, row.total), 0)
      const categories: CategorySlice[] = rows.map((row) => ({
        ...row,
        share: largest > 0 ? row.total / largest : 0,
      }))

      return {
        currency,
        total: bucket.total,
        previousTotal: bucket.previousTotal,
        categories,
        months: months.map((month) => ({ month, total: bucket.months.get(month) ?? 0 })),
      }
    })
    // Biggest spender first, so the card that answers the question is read first.
    // A currency idle this month keeps its card — its history is still on it.
    .sort((a, b) => b.total - a.total || b.previousTotal - a.previousTotal)

  const recent: RecentItem[] = rows.slice(0, RECENT_LIMIT).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category_name,
    amount: Number(row.amount),
    currency: row.currency_code,
    occurredAt: row.occurred_at,
  }))

  return { currencies, recent, monthStart: current.toISOString() }
}
