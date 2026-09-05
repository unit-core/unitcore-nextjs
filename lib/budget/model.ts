import type { PostgrestError } from '@supabase/supabase-js'

import { refusalMessage } from '@/lib/supabase/errors'

/** Not `public`, so **every** query has to go through `.schema(BUDGET_SCHEMA)`. */
export const BUDGET_SCHEMA = 'budget'

/**
 * The currency the assistant writes when nobody said otherwise, repeated here so
 * a transaction typed into the form and one dictated to Claude land the same way
 * — see `create_transaction` in lib/mcp/tools.ts.
 */
export const DEFAULT_CURRENCY = 'RUB'

/**
 * What `budget.currency_code` accepts, and nothing more: the domain is a text
 * type with `CHECK (VALUE ~ '^[A-Z]{3}$')` on it. Checked here so a typo comes
 * back as a sentence rather than as a constraint violation in English no one
 * asked for.
 */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/

/** Columns of `budget.transactions` the form needs to fill itself in. */
export const TRANSACTION_COLUMNS = 'id, space_id, title, occurred_at, currency_code'

export interface TransactionRow {
  id: string
  space_id: string
  title: string | null
  occurred_at: string
  currency_code: string
}

/**
 * Columns of `budget.transaction_items` the form can change. The date, the
 * currency and the space are on the parent and pushed down by triggers, so they
 * are not read here either — one copy of a value is one place to edit it.
 */
export const TRANSACTION_ITEM_COLUMNS = 'id, name, amount, category_id'

export interface TransactionItemRow {
  id: string
  name: string
  /** `numeric(14,4)`, which PostgREST serialises as a string. */
  amount: string | number
  category_id: string | null
}

export interface TransactionItem {
  id: string
  name: string
  amount: number
  categoryId: string | null
}

export interface Transaction {
  id: string
  spaceId: string
  title: string
  occurredAt: string
  currencyCode: string
  items: TransactionItem[]
}

/** Columns of `budget.categories` this client reads. `space_id` is the filter, not a field. */
export const CATEGORY_COLUMNS = 'id, name, kind'

/** Expense or income — the only two, and the choice a category cannot change its mind about later. */
export type CategoryKind = 'expense' | 'income'

export interface CategoryRow {
  id: string
  name: string
  kind: CategoryKind
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
}

export const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
})

/**
 * Every sentence the budget forms can have to show. Held apart from the
 * dictionary for the same reason `TaskMessages` is: the dictionary is read
 * through `next/root-params`, which is a server concern, so the page passes the
 * strings down and the hooks never import it.
 */
export interface BudgetMessages {
  notAllowed: string
  silent: string
  unknown: string
}

export type WriteOutcome = { ok: true } | { ok: false; message: string }

/**
 * Whether a write actually happened, and what to say when it did not.
 *
 * The same trap `checkWrite` in lib/tasks/model.ts describes: a row RLS does not
 * admit never reaches the statement, so PostgREST answers zero rows and no
 * error, which reads exactly like success. Hence the `.select()` on every
 * mutation — without it there is nothing to count.
 *
 * Errors go through {@link refusalMessage}, so `42501` — the restrictive write
 * gate, the membership policies — becomes one sentence and anything else is
 * passed through as the fault it is.
 */
export function checkBudgetWrite(
  result: { data: unknown[] | null; error: PostgrestError | null },
  messages: BudgetMessages
): WriteOutcome {
  if (result.error) return { ok: false, message: refusalMessage(result.error, messages) }
  if (!result.data?.length) return { ok: false, message: messages.silent }
  return { ok: true }
}

/**
 * A typed amount as the column will hold it, or null when it is not a number
 * this table accepts.
 *
 * A comma is a decimal point: the app is read in Russian, where it is the
 * decimal separator on the keyboard and in every price tag. `numeric(14,4)`
 * fixes the scale, and `CHECK (amount > 0)` fixes the sign — the kind of the
 * category decides whether the money came or went, never the sign of the number.
 */
export function parseAmount(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return null
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  // Rounded rather than refused: four places is the column's precision, and a
  // fifth digit is a slip of the finger, not a different amount.
  return Math.round(value * 10000) / 10000
}

/** A moment as the `yyyy-mm-dd` an `<input type="date">` speaks. Local, like the calendar on the wall. */
export function dateInputOf(moment: Date | string): string {
  const at = typeof moment === 'string' ? new Date(moment) : moment
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** Today, in the same shape. */
export const todayInput = () => dateInputOf(new Date())

/**
 * A day from the date field, pinned to **noon** local.
 *
 * Noon rather than midnight so that converting to UTC cannot slide the entry
 * into the neighbouring day — and, on the first or last of a month, into the
 * neighbouring month, which is the unit the dashboard totals by. Undefined when
 * the field holds nothing a date can be made of.
 */
export function noonOf(dateInput: string): string | undefined {
  const [year, month, day] = (dateInput || '').split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day, 12, 0, 0).toISOString()
}

/**
 * What a *new* transaction should send as `occurred_at`.
 *
 * Today is `undefined`: the column defaults to `now()`, and the real time of day
 * is more useful than a noon nobody was there for. Editing an existing
 * transaction uses {@link noonOf} instead — there the field having moved is the
 * whole instruction, and "today" has to be written out like any other day.
 */
export function occurredAtFor(dateInput: string): string | undefined {
  if (!dateInput || dateInput === todayInput()) return undefined
  return noonOf(dateInput)
}

/**
 * An amount as it should appear in the field it can be edited in.
 *
 * The column's scale is fixed, so `12.5` comes back as `12.5000`; four zeroes
 * nobody typed are four characters to delete before the number can be changed.
 */
export const amountInput = (amount: string | number): string => String(Number(amount))
