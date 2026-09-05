'use client'

import { useCallback, useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  BUDGET_SCHEMA,
  CATEGORY_COLUMNS,
  checkBudgetWrite,
  toCategory,
  type BudgetMessages,
  type Category,
  type CategoryKind,
  type CategoryRow,
} from '@/lib/budget/model'

/**
 * The categories of one space, and a way to add one.
 *
 * A category belongs to a space and cannot be lent to another: the composite
 * foreign key `transaction_items(category_id, space_id) → categories(id,
 * space_id)` refuses it at the database rather than at the form. So the list is
 * read per space and dropped whenever the space changes — `undefined` (nothing
 * chosen yet, or still loading) means an empty list rather than every category
 * the reader can see.
 *
 * This is the first thing in the web app to read `budget.categories` at all;
 * until now only the assistant knew they existed.
 */
export const useCategories = (spaceId: string | undefined, messages: BudgetMessages) => {
  // The list and the space it answers for, held as one value. Two pieces of
  // state would let a render see last space's categories under this space's
  // name, and clearing them from the effect is the cascading render the lint
  // rule is about: the answer is simply not to trust a list whose space has
  // moved on.
  const [loaded, setLoaded] = useState<{ spaceId: string; items: Category[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spaceId) return

    let active = true

    const load = async () => {
      const supabase = createClient()
      const { data, error: readError } = await supabase
        .schema(BUDGET_SCHEMA)
        .from('categories')
        .select(CATEGORY_COLUMNS)
        .eq('space_id', spaceId)
        .order('name', { ascending: true })
        .returns<CategoryRow[]>()

      if (!active) return

      if (readError) {
        setError(readError.message)
        setLoaded({ spaceId, items: [] })
        return
      }

      setLoaded({ spaceId, items: (data ?? []).map(toCategory) })
      setError(null)
    }

    void load()
    return () => {
      active = false
    }
  }, [spaceId])

  /**
   * A new category, written from whichever form needed it.
   *
   * Two names alike are not an error here: `budget.categories` has no unique
   * index on `(space_id, name)`, and the assistant's `create_categories` says
   * the same thing. Only `space_id`, `name` and `kind` are granted — `kind` is
   * the one that matters, since income is the only thing the dashboard has to be
   * told about explicitly.
   */
  const createCategory = useCallback(
    async (input: { spaceId: string; name: string; kind: CategoryKind }): Promise<Category | null> => {
      const supabase = createClient()
      const { data, error: insertError } = await supabase
        .schema(BUDGET_SCHEMA)
        .from('categories')
        .insert({ space_id: input.spaceId, name: input.name.trim(), kind: input.kind })
        .select(CATEGORY_COLUMNS)
        .returns<CategoryRow[]>()

      const outcome = checkBudgetWrite({ data, error: insertError }, messages)
      if (!outcome.ok) {
        setError(outcome.message)
        return null
      }

      const category = toCategory(data![0])
      setError(null)
      setLoaded((current) =>
        current && current.spaceId === input.spaceId
          ? {
              spaceId: current.spaceId,
              items: [...current.items, category].sort((a, b) => a.name.localeCompare(b.name)),
            }
          : current
      )
      return category
    },
    [messages]
  )

  const categories = loaded && loaded.spaceId === spaceId ? loaded.items : []

  return { categories, isLoading: Boolean(spaceId) && loaded?.spaceId !== spaceId, error, createCategory }
}
