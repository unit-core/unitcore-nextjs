'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { needsRenumber, POSITION_STEP, type TaskPriority } from '@/lib/tasks/format'
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
  type WriteOutcome,
} from '@/lib/tasks/model'

/**
 * Closed tasks are read separately and capped.
 *
 * PostgREST answers with at most 1000 rows whatever `.limit()` says, and the
 * open half of a board never approaches that — but a year of closed tasks
 * does, and it would push the open ones out of the answer. Two queries keep the
 * part that matters complete and the part behind "show closed" bounded.
 */
const DONE_LIMIT = 200

/** One page of the trash, and the batch size every bulk write is cut into. */
const TRASH_PAGE = 100

/**
 * `statement_timeout` for `authenticated` is 8 seconds, so a bulk operation is
 * sent in pieces rather than as one `in.(…)` with everything in it.
 */
const BATCH = 50

export interface TrashEntry {
  id: string
  title: string
  deletedAt: string
  parentId: string | null
}

interface TrashRow {
  id: string
  title: string
  deleted_at: string
  parent_id: string | null
}

interface SpaceRow {
  id: string
  name: string
  is_mine: boolean
}

export interface BoardSpace {
  id: string
  name: string
  isMine: boolean
}

export type BoardBusy =
  | { kind: 'createList' }
  | { kind: 'emptyTrash' }
  | { kind: 'createTask'; listId: string | null }
  | { kind: 'list'; listId: string }
  | { kind: 'task'; taskId: string }
  | null

/** A new task's list: `null` is Inbox, which is a value and not a row. */
export interface NewTask {
  listId: string | null
  title: string
  parentId?: string | null
}

/**
 * One space's board: its lists and its root tasks.
 *
 * Reads go through the views, writes go straight to the tables. There is no RPC
 * layer for tasks and there should not be one: an invitation changes who may
 * see what and has to be a `security definer` function, while a task is data
 * inside a boundary that is already drawn — RLS plus column grants are the
 * whole of its protection.
 */
export const useTaskBoard = (spaceId: string, messages: TaskMessages) => {
  const [space, setSpace] = useState<BoardSpace | null>(null)
  const [lists, setLists] = useState<TaskList[]>([])
  const [archivedLists, setArchivedLists] = useState<TaskList[]>([])
  const [openTasks, setOpenTasks] = useState<TaskCard[]>([])
  const [doneTasks, setDoneTasks] = useState<TaskCard[]>([])
  const [trash, setTrash] = useState<TrashEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BoardBusy>(null)
  // The counter from use-space.ts: the load lives inside the effect so an
  // unmounted page stops setting state halfway through, and this is what asks
  // for it again. Every mutation that the database may have widened — closing a
  // parent, deleting, restoring — ends by bumping it.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      // limit(1) rather than maybeSingle(): a space RLS hides is an empty
      // answer, not an error, and the page renders that as "not yours".
      const { data: spaceRows, error: spaceError } = await supabase
        .from('my_spaces')
        .select('id, name, is_mine')
        .eq('id', spaceId)
        .limit(1)
        .returns<SpaceRow[]>()
      if (spaceError) {
        if (active) {
          setError(spaceError.message)
          setIsLoading(false)
        }
        return
      }

      const spaceRow = spaceRows?.[0]
      if (!spaceRow) {
        if (active) {
          setSpace(null)
          setLists([])
          setOpenTasks([])
          setDoneTasks([])
          setError(null)
          setIsLoading(false)
        }
        return
      }

      // Set before the lists are asked for, not after: if the `tasks` schema
      // itself answers with an error — it is not in Exposed schemas, say — the
      // page must show that error under this space's name, rather than falling
      // through to "no such space" about a space it has just read successfully.
      if (!active) return
      setSpace({ id: spaceRow.id, name: spaceRow.name, isMine: spaceRow.is_mine })

      const [listResult, openResult, doneResult] = await Promise.all([
        supabase
          .schema(TASKS_SCHEMA)
          .from('list_cards')
          .select(LIST_CARD_COLUMNS)
          .eq('space_id', spaceId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .returns<ListCardRow[]>(),
        // Root tasks only. A subtask stores no `list_id`, so it belongs to no
        // column of its own — it shows inside its parent's card instead.
        supabase
          .schema(TASKS_SCHEMA)
          .from('task_cards')
          .select(TASK_CARD_COLUMNS)
          .eq('space_id', spaceId)
          .is('parent_id', null)
          .eq('is_done', false)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .returns<TaskCardRow[]>(),
        supabase
          .schema(TASKS_SCHEMA)
          .from('task_cards')
          .select(TASK_CARD_COLUMNS)
          .eq('space_id', spaceId)
          .is('parent_id', null)
          .eq('is_done', true)
          .order('completed_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(DONE_LIMIT)
          .returns<TaskCardRow[]>(),
      ])

      const failure = listResult.error ?? openResult.error ?? doneResult.error
      if (failure) {
        if (active) {
          setError(failure.message)
          setIsLoading(false)
        }
        return
      }

      if (!active) return

      const allLists = (listResult.data ?? []).map(toTaskList)
      setLists(allLists.filter((list) => !list.archivedAt))
      setArchivedLists(allLists.filter((list) => list.archivedAt))
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

  const reload = () => setReloadToken((token) => token + 1)

  const report = (outcome: WriteOutcome) => {
    setError(outcome.ok ? null : outcome.message)
    return outcome.ok
  }

  // ── tasks ────────────────────────────────────────────────────────────────

  /**
   * `position` is deliberately absent: the trigger puts a new task at
   * `max + 1024` of its own group — space, list and parent together — which is
   * the end of the column the reader is typing into. Sending a position here
   * would only be a worse guess at the same number.
   *
   * `space_id` is sent because the table needs it; `created_by`, `created_at`
   * and `updated_at` are not, because they have no grant and no need of one.
   */
  const createTask = async ({ listId, title, parentId = null }: NewTask) => {
    setBusy({ kind: 'createTask', listId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .insert({
          space_id: spaceId,
          // A subtask's list is its parent's, and the trigger nulls whatever is
          // written here, so it is left out rather than guessed at.
          list_id: parentId ? null : listId,
          parent_id: parentId,
          title: title.trim(),
        })
        .select('id'),
      messages
    )
    setBusy(null)
    if (!report(outcome)) return false
    reload()
    return true
  }

  /**
   * Closing and reopening. The value is normalised on the server — a task
   * cannot be closed with a future timestamp — so the row is taken from the
   * answer rather than from what was sent.
   *
   * Closing a parent closes its open subtasks, in the database, in one trigger.
   * Nothing here tries to mirror that: the board is reread instead, which is
   * also the only way the counters under the title come back right.
   */
  const setTaskDone = async (task: TaskCard, done: boolean) => {
    setBusy({ kind: 'task', taskId: task.id })
    // The one place optimism is allowed, along with dragging: a checkbox that
    // waits for a round trip feels broken, and the correction is a reread away.
    const moved = { ...task, isDone: done, completedAt: done ? new Date().toISOString() : null }
    if (done) {
      setOpenTasks((current) => current.filter((row) => row.id !== task.id))
      setDoneTasks((current) => [moved, ...current])
    } else {
      setDoneTasks((current) => current.filter((row) => row.id !== task.id))
      setOpenTasks((current) => [...current, moved])
    }

    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq('id', task.id)
        .select('id'),
      messages
    )
    setBusy(null)

    if (!report(outcome)) {
      reload()
      return false
    }
    // A parent takes its subtasks with it, and the "1 of 2" under the title is
    // now wrong on screen. Only pay for the reread when there is something to
    // correct.
    if (task.subtaskCount > 0) reload()
    return true
  }

  /**
   * Dragging, in one `UPDATE`: the list and the place inside it.
   *
   * Positions are fractional, so a card dropped between two neighbours takes
   * the average of theirs and nobody else moves. That only holds while the
   * fraction is still short — see {@link renumber}, which the caller runs first
   * when it is not.
   */
  const moveTask = async (taskId: string, listId: string | null, position: number) => {
    setBusy({ kind: 'task', taskId })
    setOpenTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, listId, position } : task))
    )

    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ list_id: listId, position })
        .eq('id', taskId)
        .select('id'),
      messages
    )
    setBusy(null)

    if (!report(outcome)) {
      reload()
      return false
    }
    return true
  }

  /**
   * Spreads a column back over `1024, 2048, …` when its fractions have grown
   * past what a `numeric` should have to carry (§5.6). Cheaper than a
   * background job, which has nowhere to run: `pg_cron` is not installed here.
   */
  const renumber = async (listId: string | null) => {
    const column = openTasks
      .filter((task) => task.listId === listId)
      .sort((a, b) => a.position - b.position)
    if (!column.length || !needsRenumber(column.map((task) => task.positionRaw))) return false

    const supabase = createClient()
    for (let index = 0; index < column.length; index += 1) {
      const outcome = checkWrite(
        await supabase
          .schema(TASKS_SCHEMA)
          .from('tasks')
          .update({ position: (index + 1) * POSITION_STEP })
          .eq('id', column[index].id)
          .select('id'),
        messages
      )
      if (!report(outcome)) break
    }
    reload()
    return true
  }

  /**
   * Ordinary deletion is soft, always. A real `DELETE` belongs to one button —
   * "empty the trash" — and nothing else in the product may call it: a mistake
   * behind `deleted_at` costs one click to undo, and a mistake behind `DELETE`
   * costs the task.
   */
  const deleteTask = async (taskId: string) => {
    setBusy({ kind: 'task', taskId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id'),
      messages
    )
    setBusy(null)
    if (!report(outcome)) return false
    // Subtasks went with it, and the trash on screen predates both.
    setTrash(null)
    reload()
    return true
  }

  /** Undo, and the button in the trash. Returns whatever left with it. */
  const restoreTask = async (taskId: string) => {
    setBusy({ kind: 'task', taskId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ deleted_at: null })
        .eq('id', taskId)
        .select('id'),
      messages
    )
    setBusy(null)
    if (!report(outcome)) return false
    setTrash(null)
    reload()
    return true
  }

  // ── trash ────────────────────────────────────────────────────────────────

  /**
   * Read from the table, not from a view: every view in this schema hides
   * `deleted_at is not null`, which is the whole point of them.
   *
   * A subtask that went down with its parent is filtered out here — it comes
   * back with the parent, and listing it separately would offer a restore that
   * puts half a task back.
   */
  const loadTrash = async () => {
    const supabase = createClient()
    const { data, error: trashError } = await supabase
      .schema(TASKS_SCHEMA)
      .from('tasks')
      .select('id, title, deleted_at, parent_id')
      .eq('space_id', spaceId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(0, TRASH_PAGE - 1)
      .returns<TrashRow[]>()

    if (trashError) {
      setError(trashError.message)
      return
    }

    const deleted = new Set((data ?? []).map((row) => row.id))
    setTrash(
      (data ?? [])
        .filter((row) => !row.parent_id || !deleted.has(row.parent_id))
        .map((row) => ({
          id: row.id,
          title: row.title,
          deletedAt: row.deleted_at,
          parentId: row.parent_id,
        }))
    )
    setError(null)
  }

  /** The one place a real `DELETE` is allowed. Irreversible, and cascading. */
  const emptyTrash = async () => {
    setBusy({ kind: 'emptyTrash' })
    const supabase = createClient()

    // A page at a time, because the trash may hold more rows than PostgREST
    // will return, and in batches, because eight seconds is the whole budget.
    for (let round = 0; round < 20; round += 1) {
      const { data, error: idsError } = await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .select('id')
        .eq('space_id', spaceId)
        .not('deleted_at', 'is', null)
        .range(0, TRASH_PAGE - 1)
        .returns<{ id: string }[]>()
      if (idsError) {
        setBusy(null)
        setError(idsError.message)
        return false
      }
      if (!data?.length) break

      for (let start = 0; start < data.length; start += BATCH) {
        const ids = data.slice(start, start + BATCH).map((row) => row.id)
        const { error: deleteError } = await supabase
          .schema(TASKS_SCHEMA)
          .from('tasks')
          .delete()
          .in('id', ids)
        if (deleteError) {
          setBusy(null)
          setError(deleteError.message)
          return false
        }
      }
    }

    setBusy(null)
    setError(null)
    setTrash([])
    reload()
    return true
  }

  // ── lists ────────────────────────────────────────────────────────────────

  /**
   * A list, or the one that already has this name.
   *
   * A duplicate name is `23505` from `lists_space_name_idx`, and the useful
   * answer to "make me a Shopping list" when there is one is that list, not an
   * error. So the refusal is turned back into a lookup and the caller is handed
   * the existing id — the same shape `create_list` has over MCP.
   */
  const createList = async (name: string, color?: string | null): Promise<string | null> => {
    setBusy({ kind: 'createList' })
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .schema(TASKS_SCHEMA)
      .from('lists')
      .insert({ space_id: spaceId, name: name.trim(), ...(color ? { color } : {}) })
      .select('id')
      .returns<{ id: string }[]>()

    if (insertError?.code === '23505') {
      const { data: existing } = await supabase
        .schema(TASKS_SCHEMA)
        .from('list_cards')
        .select('id')
        .eq('space_id', spaceId)
        .eq('name', name.trim())
        .limit(1)
        .returns<{ id: string }[]>()
      setBusy(null)
      setError(messages.duplicateName)
      // No reload here, deliberately. The column is already on the board — it
      // has to be, for the name to have collided — and a reread would finish by
      // clearing the error it was asked for, so the one sentence explaining why
      // no second list appeared would never be on screen long enough to read.
      return existing?.[0]?.id ?? null
    }

    setBusy(null)
    if (!report(checkWrite({ data, error: insertError }, messages))) return null
    reload()
    return data?.[0]?.id ?? null
  }

  const updateList = async (
    listId: string,
    patch: { name?: string; color?: string | null; archived_at?: string | null }
  ) => {
    setBusy({ kind: 'list', listId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('lists')
        .update(patch)
        .eq('id', listId)
        .select('id'),
      messages
    )
    setBusy(null)
    if (!report(outcome)) return false
    reload()
    return true
  }

  /**
   * Deleting a list does not delete its tasks: the foreign key nulls their
   * `list_id`, and they reappear under Inbox. That is not what most task
   * applications do, so the dialog says it in words and with the number — see
   * `tasks.list.deleteWarning`.
   */
  const deleteList = async (listId: string) => {
    setBusy({ kind: 'list', listId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('lists')
        .delete()
        .eq('id', listId)
        .select('id'),
      messages
    )
    setBusy(null)
    if (!report(outcome)) return false
    reload()
    return true
  }

  return {
    space,
    lists,
    archivedLists,
    openTasks,
    doneTasks,
    trash,
    isLoading,
    error,
    busy,
    reload,
    setError,
    createTask,
    setTaskDone,
    moveTask,
    renumber,
    deleteTask,
    restoreTask,
    loadTrash,
    emptyTrash,
    createList,
    updateList,
    deleteList,
  }
}

export type { TaskCard, TaskList, TaskPriority }
