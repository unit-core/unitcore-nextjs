'use client'

import { useCallback, useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  BUDGET_SCHEMA,
  TRANSACTION_COLUMNS,
  TRANSACTION_ITEM_COLUMNS,
  checkBudgetWrite,
  dateInputOf,
  noonOf,
  type BudgetMessages,
  type Transaction,
  type TransactionItemRow,
  type TransactionRow,
} from '@/lib/budget/model'

/** One line as the form hands it back: with an id when it was already a row. */
export interface EditedItem {
  id?: string
  name: string
  amount: number
  categoryId: string | null
}

export interface TransactionEdit {
  title: string
  currencyCode: string
  /** `yyyy-mm-dd`, compared against the stored day rather than the stored instant. */
  dateInput: string
  items: EditedItem[]
}

/**
 * One transaction, and the changes a form can make to it.
 *
 * Read as two queries because it is two tables, and written as up to four
 * statements because there is no RPC to do it in one — the same constraint the
 * create path lives under. What saves the day is that only the shape changes
 * here: `space_id` has no update grant at all, so a transaction cannot be moved
 * between spaces by accident, and neither the form nor this hook has to guard
 * against it.
 *
 * Writes are ordered header, updates, inserts, deletes. Deleting last is not
 * fussiness: a transaction whose items are all gone is money with no story, and
 * for the moment between two statements it should never be one.
 */
export const useTransaction = (transactionId: string | null, messages: BudgetMessages) => {
  // The answer together with the question it answers, the way `useTask` holds
  // its task: reopening the dialog on a second transaction would otherwise show
  // the first one until its own read came back. `transaction: null` inside a
  // loaded pair is a real answer — deleted, or never visible to this reader.
  const [loaded, setLoaded] = useState<{ id: string; transaction: Transaction | null } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!transactionId) return

    let active = true

    const load = async () => {
      const supabase = createClient()
      const [headResult, itemsResult] = await Promise.all([
        supabase
          .schema(BUDGET_SCHEMA)
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('id', transactionId)
          .limit(1)
          .returns<TransactionRow[]>(),
        supabase
          .schema(BUDGET_SCHEMA)
          .from('transaction_items')
          .select(TRANSACTION_ITEM_COLUMNS)
          .eq('transaction_id', transactionId)
          .order('created_at', { ascending: true })
          .returns<TransactionItemRow[]>(),
      ])

      if (!active) return

      const failure = headResult.error ?? itemsResult.error
      if (failure) {
        setError(failure.message)
        setLoaded({ id: transactionId, transaction: null })
        return
      }

      const head = headResult.data?.[0]
      // No row and no error is the answer RLS gives, and it is the same answer
      // a deleted transaction gives. Either way there is nothing to show.
      setLoaded({
        id: transactionId,
        transaction: head
          ? {
              id: head.id,
              spaceId: head.space_id,
              title: head.title ?? '',
              occurredAt: head.occurred_at,
              currencyCode: head.currency_code,
              items: (itemsResult.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                amount: Number(row.amount),
                categoryId: row.category_id,
              })),
            }
          : null,
      })
      setError(null)
    }

    void load()
    return () => {
      active = false
    }
  }, [transactionId])

  const isCurrent = transactionId !== null && loaded?.id === transactionId
  const transaction = isCurrent ? loaded.transaction : null

  const updateTransaction = useCallback(
    async (edit: TransactionEdit) => {
      if (!transaction) return false

      const supabase = createClient()
      const budget = () => supabase.schema(BUDGET_SCHEMA)
      setIsSaving(true)

      const fail = (message: string) => {
        setIsSaving(false)
        setError(message)
        return false
      }

      const title = edit.title.trim()
      const patch: Record<string, string | null> = {}
      if (title !== transaction.title) patch.title = title || null
      if (edit.currencyCode !== transaction.currencyCode) patch.currency_code = edit.currencyCode
      // The day, not the instant: the field cannot express the time of day, so a
      // date left alone must leave the stored moment exactly as it was.
      if (edit.dateInput !== dateInputOf(transaction.occurredAt)) {
        const moment = noonOf(edit.dateInput)
        if (moment) patch.occurred_at = moment
      }

      if (Object.keys(patch).length > 0) {
        const outcome = checkBudgetWrite(
          await budget().from('transactions').update(patch).eq('id', transaction.id).select('id'),
          messages
        )
        if (!outcome.ok) return fail(outcome.message)
      }

      const before = new Map(transaction.items.map((item) => [item.id, item]))
      for (const item of edit.items) {
        const was = item.id ? before.get(item.id) : undefined
        if (!was) continue
        if (was.name === item.name.trim() && was.amount === item.amount && was.categoryId === item.categoryId) {
          continue
        }
        const outcome = checkBudgetWrite(
          await budget()
            .from('transaction_items')
            .update({ name: item.name.trim(), amount: item.amount, category_id: item.categoryId })
            .eq('id', was.id)
            .select('id'),
          messages
        )
        if (!outcome.ok) return fail(outcome.message)
      }

      const added = edit.items.filter((item) => !item.id)
      if (added.length > 0) {
        const outcome = checkBudgetWrite(
          await budget()
            .from('transaction_items')
            .insert(
              added.map((item) => ({
                transaction_id: transaction.id,
                name: item.name.trim(),
                amount: item.amount,
                category_id: item.categoryId,
              }))
            )
            .select('id'),
          messages
        )
        if (!outcome.ok) return fail(outcome.message)
      }

      const kept = new Set(edit.items.map((item) => item.id).filter(Boolean))
      const removed = transaction.items.filter((item) => !kept.has(item.id)).map((item) => item.id)
      if (removed.length > 0) {
        const outcome = checkBudgetWrite(
          await budget().from('transaction_items').delete().in('id', removed).select('id'),
          messages
        )
        if (!outcome.ok) return fail(outcome.message)
      }

      setIsSaving(false)
      setError(null)
      return true
    },
    [transaction, messages]
  )

  /**
   * The whole entry, items and all.
   *
   * One statement: `transaction_items` points at its parent with `on delete
   * cascade`, so the lines go with it in the database rather than in a loop
   * here. There is no trash for a transaction the way there is for a task —
   * nothing in `budget` is soft-deleted — which is why the button that reaches
   * this asks first.
   */
  const deleteTransaction = useCallback(async () => {
    if (!transaction) return false

    setIsSaving(true)
    const supabase = createClient()
    const outcome = checkBudgetWrite(
      await supabase
        .schema(BUDGET_SCHEMA)
        .from('transactions')
        .delete()
        .eq('id', transaction.id)
        .select('id'),
      messages
    )
    setIsSaving(false)

    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    return true
  }, [transaction, messages])

  return {
    transaction,
    isLoading: transactionId !== null && !isCurrent,
    isSaving,
    error: isCurrent || transactionId === null ? error : null,
    setError,
    /** Read, and there was nothing there — deleted, or never visible to this reader. */
    isMissing: isCurrent && transaction === null,
    updateTransaction,
    deleteTransaction,
  }
}
