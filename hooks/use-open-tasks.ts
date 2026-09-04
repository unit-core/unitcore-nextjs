'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  LIST_CARD_COLUMNS,
  TASKS_SCHEMA,
  TASK_CARD_COLUMNS,
  checkWrite,
  toTaskCard,
  toTaskList,
  type ListCardRow,
  type TaskCard,
  type TaskCardRow,
  type TaskList,
  type TaskMessages,
} from '@/lib/tasks/model'

/**
 * A dashboard widget is a glance, not a backlog. Two hundred open root tasks is
 * already more than anyone reads in a card, and it keeps the query well clear
 * of the 1000-row ceiling PostgREST answers with regardless of `.limit()`.
 */
const LIMIT = 200

/**
 * Open tasks and the lists they sit in — one space, or every space at once.
 *
 * The lean read behind the dashboard card. It deliberately shares nothing with
 * {@link useTaskBoard}: the board needs closed tasks, the trash, archived lists
 * and every mutation the product has, and paying for all of that to draw eight
 * rows on the dashboard would be the wrong trade.
 */
export const useOpenTasks = (spaceId: string | undefined, messages: TaskMessages) => {
  const [lists, setLists] = useState<TaskList[]>([])
  const [tasks, setTasks] = useState<TaskCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      // Without a space the filter is simply left off: RLS already limits both
      // relations to spaces this reader belongs to, so "all spaces" is the
      // absence of a clause rather than a list of ids gathered first.
      let listQuery = supabase
        .schema(TASKS_SCHEMA)
        .from('list_cards')
        .select(LIST_CARD_COLUMNS)
        .is('archived_at', null)
      let taskQuery = supabase
        .schema(TASKS_SCHEMA)
        .from('task_cards')
        .select(TASK_CARD_COLUMNS)
        .is('parent_id', null)
        .eq('is_done', false)
      if (spaceId) {
        listQuery = listQuery.eq('space_id', spaceId)
        taskQuery = taskQuery.eq('space_id', spaceId)
      }

      const [listResult, taskResult] = await Promise.all([
        listQuery.order('position', { ascending: true }).returns<ListCardRow[]>(),
        taskQuery
          // Dated first, oldest first, undated last: what is late should be at
          // the top of a card somebody glances at.
          .order('due_at', { ascending: true, nullsFirst: false })
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(LIMIT)
          .returns<TaskCardRow[]>(),
      ])

      if (!active) return

      const failure = listResult.error ?? taskResult.error
      if (failure) {
        setError(failure.message)
        setIsLoading(false)
        return
      }

      setLists((listResult.data ?? []).map(toTaskList))
      setTasks((taskResult.data ?? []).map(toTaskCard))
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [spaceId, reloadToken])

  const reload = () => setReloadToken((token) => token + 1)

  /** The only write the widget offers, and the one optimism is meant for. */
  const complete = async (taskId: string) => {
    setBusyTaskId(taskId)
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
    setBusyTaskId(null)

    if (!outcome.ok) {
      setError(outcome.message)
      reload()
      return false
    }
    setError(null)
    setTasks((current) => current.filter((task) => task.id !== taskId))
    return true
  }

  return { lists, tasks, isLoading, error, busyTaskId, reload, complete }
}
