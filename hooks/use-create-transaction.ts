'use client'

import { useCallback, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { BUDGET_SCHEMA, checkBudgetWrite, type BudgetMessages } from '@/lib/budget/model'

/** One line of a transaction: what it was, how much, and what it counts as. */
export interface DraftItem {
  name: string
  amount: number
  categoryId: string | null
}

export interface DraftTransaction {
  spaceId: string
  /** Optional, and null in the column when it is left blank. */
  title: string
  currencyCode: string
  /** Left out entirely for today, so the column's own `now()` sets the time. */
  occurredAt?: string
  items: DraftItem[]
}

/**
 * Writing a transaction from the browser, the way the assistant writes one.
 *
 * There is no RPC to do this in a single statement, and there cannot be a
 * convenient one: `supabase/checks/security-invariants.sql` forbids a `security
 * definer` function that returns rows. So it is two inserts, and the second one
 * failing has to be cleaned up by hand — a transaction with no items is money
 * with no story, invisible on the dashboard but present in every count. That
 * rollback is copied from `create_transaction` in lib/mcp/tools.ts on purpose:
 * two ways to write the same thing should at least fail the same way.
 *
 * `space_id`, `occurred_at` and `currency_code` are not passed on the items.
 * The `item_inherit_from_transaction` trigger copies them from the parent, and
 * `authenticated` has no grant on those columns anyway.
 */
export const useCreateTransaction = (messages: BudgetMessages) => {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTransaction = useCallback(
    async (draft: DraftTransaction) => {
      setIsSaving(true)
      const supabase = createClient()

      const { data, error: insertError } = await supabase
        .schema(BUDGET_SCHEMA)
        .from('transactions')
        .insert({
          space_id: draft.spaceId,
          title: draft.title.trim() || null,
          currency_code: draft.currencyCode,
          ...(draft.occurredAt ? { occurred_at: draft.occurredAt } : {}),
        })
        .select('id')
        .returns<{ id: string }[]>()

      const written = checkBudgetWrite({ data, error: insertError }, messages)
      if (!written.ok) {
        setIsSaving(false)
        setError(written.message)
        return false
      }

      const transactionId = data![0].id
      const { data: items, error: itemsError } = await supabase
        .schema(BUDGET_SCHEMA)
        .from('transaction_items')
        .insert(
          draft.items.map((item) => ({
            transaction_id: transactionId,
            name: item.name.trim(),
            amount: item.amount,
            category_id: item.categoryId,
          }))
        )
        .select('id')
        .returns<{ id: string }[]>()

      const filled = checkBudgetWrite({ data: items, error: itemsError }, messages)
      if (!filled.ok) {
        // The header is already in the table and nothing else will ever refer to
        // it. Whether this delete succeeds is not worth reporting: the sentence
        // the reader needs is about the items.
        await supabase.schema(BUDGET_SCHEMA).from('transactions').delete().eq('id', transactionId)
        setIsSaving(false)
        setError(filled.message)
        return false
      }

      setIsSaving(false)
      setError(null)
      return true
    },
    [messages]
  )

  return { createTransaction, isSaving, error, setError }
}
