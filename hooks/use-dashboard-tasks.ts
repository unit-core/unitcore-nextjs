'use client'

import { useEffect, useRef, useState } from 'react'

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

/** Closed tasks accumulate forever; the card only ever shows the last few. */
const DONE_LIMIT = 50

/** How long a task stays where it was after being ticked, before it leaves. */
export const HOLD_MS = 3000

/** The collapse itself. Must match the transition in the card. */
export const COLLAPSE_MS = 300

/**
 * A row that has been written but is still drawn where it was.
 *
 * `completing` sits in the open list wearing a tick; `reopening` sits in the
 * closed list without one. Either way the database already agrees with the
 * checkbox — only the row's departure is being held back, so that a task never
 * vanishes from under the finger that just tapped it.
 */
export type Settling = 'completing' | 'reopening'

const without = <T,>(map: Record<string, T>, id: string) => {
  const next = { ...map }
  delete next[id]
  return next
}

/**
 * The order the open query asks for, repeated here for rows that come back
 * without one.
 *
 * Reordering is presentation, not a rule the database owns, so restating it is
 * not the second implementation §9 warns about — the board sorts its columns
 * the same way. Dated first, oldest first, undated last, then position and
 * `created_at` so two tasks never swap places between renders.
 */
const byDue = (a: TaskCard, b: TaskCard) => {
  if (a.dueAt !== b.dueAt) {
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt.localeCompare(b.dueAt)
  }
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt)
}

/**
 * Tasks and the lists they sit in — one space, or every space at once.
 *
 * The lean read behind the dashboard card. It deliberately shares nothing with
 * {@link useTaskBoard}: the board needs the trash, archived lists and every
 * mutation the product has, and paying for all of that to draw eight rows on
 * the dashboard would be the wrong trade.
 *
 * Open and closed arrive as two queries and stay two arrays, because the card
 * shows them as two things: the list, and what is folded away under it.
 */
export const useDashboardTasks = (spaceId: string | undefined, messages: TaskMessages) => {
  const [lists, setLists] = useState<TaskList[]>([])
  const [openTasks, setOpenTasks] = useState<TaskCard[]>([])
  const [doneTasks, setDoneTasks] = useState<TaskCard[]>([])
  const [settling, setSettling] = useState<Record<string, Settling>>({})
  const [leaving, setLeaving] = useState<Record<string, true>>({})
  // Tasks written from this card since the last full read. The card draws them
  // even when they fall past its cap: a task typed in and then not visible
  // anywhere reads as one that was not saved.
  const [created, setCreated] = useState<Record<string, true>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Departures in flight. A ref rather than state: nothing renders from it, and
  // a tap has to be able to read it synchronously to tell "I changed my mind"
  // from "tick this one too".
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    // Captured at setup, as the hooks lint rule wants: reading `timers.current`
    // in the cleanup would read whatever the ref holds at unmount instead.
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      // Without a space the filter is simply left off: RLS already limits every
      // relation to spaces this reader belongs to, so "all spaces" is the
      // absence of a clause rather than a list of ids gathered first.
      let listQuery = supabase
        .schema(TASKS_SCHEMA)
        .from('list_cards')
        .select(LIST_CARD_COLUMNS)
        .is('archived_at', null)
      let openQuery = supabase
        .schema(TASKS_SCHEMA)
        .from('task_cards')
        .select(TASK_CARD_COLUMNS)
        .is('parent_id', null)
        .eq('is_done', false)
      let doneQuery = supabase
        .schema(TASKS_SCHEMA)
        .from('task_cards')
        .select(TASK_CARD_COLUMNS)
        .is('parent_id', null)
        .eq('is_done', true)
      if (spaceId) {
        listQuery = listQuery.eq('space_id', spaceId)
        openQuery = openQuery.eq('space_id', spaceId)
        doneQuery = doneQuery.eq('space_id', spaceId)
      }

      // Closed tasks are read now rather than when the section is expanded: the
      // number on "show closed (N)" has to be right before anyone presses it,
      // and a third query inside the same Promise.all costs no latency.
      const [listResult, openResult, doneResult] = await Promise.all([
        listQuery.order('position', { ascending: true }).returns<ListCardRow[]>(),
        openQuery
          // Dated first, oldest first, undated last: what is late should be at
          // the top of a card somebody glances at.
          .order('due_at', { ascending: true, nullsFirst: false })
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(LIMIT)
          .returns<TaskCardRow[]>(),
        doneQuery
          .order('completed_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(DONE_LIMIT)
          .returns<TaskCardRow[]>(),
      ])

      if (!active) return

      const failure = listResult.error ?? openResult.error ?? doneResult.error
      if (failure) {
        setError(failure.message)
        setIsLoading(false)
        return
      }

      setLists((listResult.data ?? []).map(toTaskList))
      setOpenTasks((openResult.data ?? []).map(toTaskCard))
      setDoneTasks((doneResult.data ?? []).map(toTaskCard))
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [spaceId, reloadToken])

  /**
   * Ask for the whole card again. Anything still on its way out is dropped
   * first: the answer will place those rows itself, and a timer left running
   * would move a row the server has just put where it belongs.
   */
  const reload = () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
    setSettling({})
    setLeaving({})
    // The fresh answer places new tasks where they belong, so they stop needing
    // to be pinned into view.
    setCreated({})
    setReloadToken((token) => token + 1)
  }

  /**
   * A new task, from the card itself.
   *
   * `space_id` is the one thing the caller must decide — the column is `not
   * null` with no default, and a dashboard showing every space at once has no
   * obvious answer, so the card resolves it before calling. `list_id` of null
   * is Inbox, which is a value rather than a row. Everything else is left
   * alone: `position` belongs to the trigger that puts the task at the end of
   * its group, and `created_by` has no grant at all.
   */
  const createTask = async (target: { spaceId: string; listId: string | null; title: string }) => {
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .schema(TASKS_SCHEMA)
      .from('tasks')
      .insert({
        space_id: target.spaceId,
        list_id: target.listId,
        title: target.title.trim(),
      })
      // The table's own column, because that is all a table can return: the
      // list name, the assignee and the counters are the view's work, and
      // asking `tasks` for them is `42703`.
      .select('id')
      .returns<{ id: string }[]>()

    const outcome = checkWrite({ data, error: insertError }, messages)
    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }

    const id = data![0].id
    const { data: cards, error: readError } = await supabase
      .schema(TASKS_SCHEMA)
      .from('task_cards')
      .select(TASK_CARD_COLUMNS)
      .eq('id', id)
      .limit(1)
      .returns<TaskCardRow[]>()
    if (readError || !cards?.length) {
      // Written, but not readable back. Ask for the whole card rather than
      // inventing a row: the task exists and has to appear.
      reload()
      return true
    }

    setError(null)
    setOpenTasks((current) => [...current, toTaskCard(cards[0])].sort(byDue))
    setCreated((current) => ({ ...current, [id]: true }))
    return true
  }

  /** The row finally changes sides, once nobody has taken it back. */
  const land = (task: TaskCard, done: boolean, completedAt: string | null) => {
    const landed = { ...task, isDone: done, completedAt }
    if (done) {
      setOpenTasks((current) => current.filter((row) => row.id !== task.id))
      setDoneTasks((current) => [landed, ...current.filter((row) => row.id !== task.id)])
    } else {
      setDoneTasks((current) => current.filter((row) => row.id !== task.id))
      setOpenTasks((current) => [...current.filter((row) => row.id !== task.id), landed].sort(byDue))
    }
    setSettling((current) => without(current, task.id))
    setLeaving((current) => without(current, task.id))
  }

  /** Hold, then collapse, then move. Two steps because a row that has already
   *  left the array cannot animate its way out of the page. */
  const scheduleDeparture = (task: TaskCard, done: boolean, completedAt: string | null) => {
    timers.current.set(
      task.id,
      setTimeout(() => {
        setLeaving((current) => ({ ...current, [task.id]: true }))
        timers.current.set(
          task.id,
          setTimeout(() => {
            timers.current.delete(task.id)
            land(task, done, completedAt)
          }, COLLAPSE_MS)
        )
      }, HOLD_MS)
    )
  }

  /**
   * Tick a task, or untick it. The only write this card offers.
   *
   * The write is not deferred, only the row's departure is. Holding the
   * statement back for three seconds would lose the whole thing if the reader
   * closed the tab inside them — a silently dropped intention, which is worse
   * than the flicker it would save. So the database agrees with the checkbox
   * immediately, and the animation is purely about where the eye goes.
   *
   * A second tap inside the window is a change of mind: it cancels the pending
   * departure and writes the opposite value, leaving the row where it always
   * was. `completed_at` is the whole of it either way — `completed_by` belongs
   * to a trigger and has no grant.
   */
  const setDone = async (task: TaskCard, done: boolean) => {
    // Read synchronously, at the moment of the tap: by the time the write
    // answers, a timer may have fired and this would be the wrong question.
    const isReversal = timers.current.has(task.id)
    if (isReversal) {
      const timer = timers.current.get(task.id)
      if (timer) clearTimeout(timer)
      timers.current.delete(task.id)
    }

    const completedAt = done ? new Date().toISOString() : null

    setBusyTaskId(task.id)
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ completed_at: completedAt })
        .eq('id', task.id)
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

    if (isReversal) {
      // Back to what it was. Nothing moves, because nothing had moved yet.
      setSettling((current) => without(current, task.id))
      setLeaving((current) => without(current, task.id))
      return true
    }

    setSettling((current) => ({ ...current, [task.id]: done ? 'completing' : 'reopening' }))
    // The value sent, not the value stored: the server normalises the moment,
    // and the authoritative one arrives with the next read. Nothing in this
    // card draws it — the sides of the list are what it is used for.
    scheduleDeparture(task, done, completedAt)
    return true
  }

  return {
    lists,
    openTasks,
    doneTasks,
    settling,
    leaving,
    created,
    isLoading,
    error,
    busyTaskId,
    reload,
    setDone,
    createTask,
    // Whether the answer filled its limit, so the card can say "200+" instead
    // of a number that is short by an unknown amount. A count that is quietly
    // wrong is worse than one that admits where it stops.
    isOpenCapped: openTasks.length >= LIMIT,
    isDoneCapped: doneTasks.length >= DONE_LIMIT,
  }
}
