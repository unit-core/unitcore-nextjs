'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  AGENDA_COLUMNS,
  TASKS_SCHEMA,
  checkWrite,
  toAgendaItem,
  type AgendaItem,
  type AgendaRow,
  type TaskMessages,
} from '@/lib/tasks/model'

export type AgendaBusy = { kind: 'complete'; taskId: string } | null

/**
 * My open tasks, across every space at once.
 *
 * One query, not one per space: `tasks.my_agenda` exists for exactly this, and
 * looping over `my_spaces` would be both slower and wrong the moment a space is
 * added between iterations. The view is `security_invoker`, so it answers with
 * the same rows RLS would give the tables — being invited to a space is not
 * being in it, and a pending invitation sees nothing.
 *
 * Subtasks are included (they carry a `parent_id`), but the view does not
 * carry the parent's title. Showing it would be a change to the view in a
 * migration, never a second query per row.
 */
export const useAgenda = (messages: TaskMessages) => {
  const [items, setItems] = useState<AgendaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<AgendaBusy>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()
      const { data, error: rowsError } = await supabase
        .schema(TASKS_SCHEMA)
        .from('my_agenda')
        .select(AGENDA_COLUMNS)
        // Dated first, oldest first, undated last. `created_at` is the second
        // key throughout: due dates are not unique, and without it two tasks
        // due the same day swap places between requests.
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .returns<AgendaRow[]>()

      if (!active) return
      if (rowsError) {
        setError(rowsError.message)
        setIsLoading(false)
        return
      }

      setItems((data ?? []).map(toAgendaItem))
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [reloadToken])

  const reload = () => setReloadToken((token) => token + 1)

  /**
   * Closing from the agenda. `completed_at` is the whole of it: `completed_by`
   * is a trigger's business, and writing it would be `42501`.
   *
   * The row leaves the agenda either way — the view lists open tasks — so it is
   * dropped here rather than waiting for a round trip. A task with subtasks
   * takes them with it in the database, which is another reason not to trust
   * anything this function could compute locally.
   */
  const complete = async (taskId: string) => {
    setBusy({ kind: 'complete', taskId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id'),
      messages
    )
    setBusy(null)

    if (!outcome.ok) {
      setError(outcome.message)
      reload()
      return false
    }

    setError(null)
    setItems((current) => current.filter((item) => item.id !== taskId))
    return true
  }

  return { items, isLoading, error, busy, reload, complete }
}
