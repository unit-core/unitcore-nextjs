'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { taskRefusal } from '@/lib/supabase/errors'
import { type TaskPriority } from '@/lib/tasks/format'
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

export interface TaskLabel {
  id: string
  name: string
  color: string | null
}

/** A candidate assignee: anyone in the space, and nobody else. */
export interface TaskPerson {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  isMe: boolean
}

export type TaskBusy =
  | { kind: 'save' }
  | { kind: 'complete'; taskId: string }
  | { kind: 'subtask' }
  | { kind: 'label'; labelId: string }
  | { kind: 'delete' }
  | null

/** What `update` may change. Everything else on a task has no grant. */
export interface TaskPatch {
  title?: string
  notes?: string | null
  listId?: string | null
  assigneeId?: string | null
  priority?: TaskPriority
  dueAt?: string | null
  dueHasTime?: boolean
}

interface PersonRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  is_me: boolean
  created_at: string
}

interface LabelRow {
  id: string
  name: string
  color: string | null
}

/**
 * One task, everything its card shows, and everything the card can change.
 *
 * The card opens over a board or over the agenda, so it fetches its own lists
 * and its own members rather than being handed them: the agenda has neither,
 * and threading them through two screens for one dialog would be a prop for
 * every field on it.
 *
 * `taskId` of null is the closed state — nothing is fetched and nothing is
 * held, so the dialog can stay mounted.
 */
export const useTask = (taskId: string | null, messages: TaskMessages) => {
  const [task, setTask] = useState<TaskCard | null>(null)
  const [subtasks, setSubtasks] = useState<TaskCard[]>([])
  const [lists, setLists] = useState<TaskList[]>([])
  const [people, setPeople] = useState<TaskPerson[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [labelIds, setLabelIds] = useState<string[]>([])
  // Which task the state above actually describes. Loading is derived from it
  // rather than flagged: an effect that flips a loading state synchronously
  // renders twice for nothing, and this answers the same question — anything
  // held for a different id than the one being asked for is not here yet.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<TaskBusy>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    // Closed. Nothing is fetched and nothing is cleared: what is still in state
    // belongs to a task nobody is asking about, and the derived values below
    // hide it until it matches again.
    if (!taskId) return

    let active = true

    const load = async () => {
      const supabase = createClient()

      const { data: rows, error: taskError } = await supabase
        .schema(TASKS_SCHEMA)
        .from('task_cards')
        .select(TASK_CARD_COLUMNS)
        .eq('id', taskId)
        .limit(1)
        .returns<TaskCardRow[]>()
      if (taskError) {
        if (active) {
          setError(taskError.message)
          setLoadedId(taskId)
        }
        return
      }

      const row = rows?.[0]
      if (!row) {
        // Deleted, or in a space this reader has just left. Both are an empty
        // answer rather than an error, and both read as "gone" on screen.
        if (active) {
          setTask(null)
          setSubtasks([])
          setLoadedId(taskId)
        }
        return
      }

      const [subtaskResult, listResult, peopleResult, labelResult, linkResult] = await Promise.all([
        supabase
          .schema(TASKS_SCHEMA)
          .from('task_cards')
          .select(TASK_CARD_COLUMNS)
          .eq('parent_id', row.id)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .returns<TaskCardRow[]>(),
        supabase
          .schema(TASKS_SCHEMA)
          .from('list_cards')
          .select(LIST_CARD_COLUMNS)
          .eq('space_id', row.space_id)
          .is('archived_at', null)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
          .returns<ListCardRow[]>(),
        // The only candidates there are. An assignee who is not a member is
        // `23514` with `hint: assignee_not_member`, so free text would be a
        // field that exists to be refused.
        supabase
          .from('space_people')
          .select('user_id, display_name, avatar_url, is_me, created_at')
          .eq('space_id', row.space_id)
          .order('created_at')
          .returns<PersonRow[]>(),
        supabase
          .schema(TASKS_SCHEMA)
          .from('labels')
          .select('id, name, color')
          .eq('space_id', row.space_id)
          .order('name')
          .returns<LabelRow[]>(),
        supabase
          .schema(TASKS_SCHEMA)
          .from('task_labels')
          .select('label_id')
          .eq('task_id', row.id)
          .returns<{ label_id: string }[]>(),
      ])

      if (!active) return

      const failure =
        subtaskResult.error ??
        listResult.error ??
        peopleResult.error ??
        labelResult.error ??
        linkResult.error
      if (failure) {
        setError(failure.message)
        setLoadedId(taskId)
        return
      }

      setTask(toTaskCard(row))
      setSubtasks((subtaskResult.data ?? []).map(toTaskCard))
      setLists((listResult.data ?? []).map(toTaskList))
      setPeople(
        (peopleResult.data ?? []).map((person) => ({
          userId: person.user_id,
          displayName: person.display_name,
          avatarUrl: person.avatar_url,
          isMe: person.is_me,
        }))
      )
      setLabels(labelResult.data ?? [])
      setLabelIds((linkResult.data ?? []).map((link) => link.label_id))
      setError(null)
      setLoadedId(taskId)
    }

    void load()
    return () => {
      active = false
    }
  }, [taskId, reloadToken])

  const reload = () => setReloadToken((token) => token + 1)

  /**
   * Every field the card edits, in one statement.
   *
   * `space_id` is not among them and never will be: moving a task to another
   * space moves it across an access boundary, which is a different kind of
   * change from editing a field. `completed_by` and `created_by` are the
   * triggers' to write.
   */
  const update = async (patch: TaskPatch) => {
    if (!task) return false
    setBusy({ kind: 'save' })

    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({
          ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.listId !== undefined ? { list_id: patch.listId } : {}),
          ...(patch.assigneeId !== undefined ? { assignee_id: patch.assigneeId } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueAt !== undefined ? { due_at: patch.dueAt } : {}),
          // The flag cannot stand without a date, and clearing the date clears
          // it: "by Friday" with no Friday is not a state the database allows.
          ...(patch.dueHasTime !== undefined ? { due_has_time: patch.dueHasTime } : {}),
        })
        .eq('id', task.id)
        .select('id'),
      messages
    )
    setBusy(null)

    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    reload()
    return true
  }

  /**
   * The heading's checkbox and each subtask's own.
   *
   * Closing the parent closes every open subtask underneath it — in one
   * trigger, in the database — so the card is reread afterwards instead of
   * being patched here. The reverse does not happen and is not a bug to fix:
   * closing the last subtask leaves the parent open, and reopening a parent
   * leaves its subtasks closed. A card showing "2 of 2" above an open checkbox
   * is that state, honestly drawn.
   */
  const setDone = async (id: string, done: boolean) => {
    setBusy({ kind: 'complete', taskId: id })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq('id', id)
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
    reload()
    return true
  }

  /**
   * One level, and the database is what says so: a subtask of a subtask is
   * `23514` with `hint: subtask_depth`. The card hides the field rather than
   * checking the depth itself — a second implementation of a server rule is a
   * second thing to keep in step with the migration that owns it.
   */
  const addSubtask = async (title: string) => {
    if (!task) return false
    setBusy({ kind: 'subtask' })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .insert({ space_id: task.spaceId, parent_id: task.id, title: title.trim() })
        .select('id'),
      messages
    )
    setBusy(null)

    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    reload()
    return true
  }

  /** Soft, with the undo the toast offers for the next few seconds. */
  const remove = async (id: string) => {
    setBusy({ kind: 'delete' })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id'),
      messages
    )
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    return true
  }

  const restore = async (id: string) => {
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('tasks')
        .update({ deleted_at: null })
        .eq('id', id)
        .select('id'),
      messages
    )
    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    return true
  }

  /** `space_id` is inherited from the task, so only the pair is written. */
  const attachLabel = async (labelId: string) => {
    if (!task) return false
    setBusy({ kind: 'label', labelId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('task_labels')
        .insert({ task_id: task.id, label_id: labelId })
        .select('label_id'),
      messages
    )
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    setLabelIds((current) => [...current, labelId])
    return true
  }

  const detachLabel = async (labelId: string) => {
    if (!task) return false
    setBusy({ kind: 'label', labelId })
    const supabase = createClient()
    const outcome = checkWrite(
      await supabase
        .schema(TASKS_SCHEMA)
        .from('task_labels')
        .delete()
        .eq('task_id', task.id)
        .eq('label_id', labelId)
        .select('label_id'),
      messages
    )
    setBusy(null)
    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setError(null)
    setLabelIds((current) => current.filter((id) => id !== labelId))
    return true
  }

  /**
   * A label by name, attached in the same gesture. A name that already exists
   * is `23505`, and the useful answer is that label rather than a refusal — the
   * same shape `createList` has on the board.
   */
  const addLabelByName = async (name: string) => {
    if (!task) return false
    const trimmed = name.trim()
    if (!trimmed) return false

    setBusy({ kind: 'label', labelId: trimmed })
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .schema(TASKS_SCHEMA)
      .from('labels')
      .insert({ space_id: task.spaceId, name: trimmed })
      .select('id, name, color')
      .returns<LabelRow[]>()

    let found = data?.[0] ?? null
    if (insertError && insertError.code === '23505') {
      const { data: existing } = await supabase
        .schema(TASKS_SCHEMA)
        .from('labels')
        .select('id, name, color')
        .eq('space_id', task.spaceId)
        .eq('name', trimmed)
        .limit(1)
        .returns<LabelRow[]>()
      found = existing?.[0] ?? null
    } else if (insertError) {
      setBusy(null)
      setError(taskRefusal(insertError, messages))
      return false
    }

    setBusy(null)
    if (!found) {
      setError(messages.unknown)
      return false
    }

    const label = found
    setLabels((current) =>
      current.some((row) => row.id === label.id) ? current : [...current, label]
    )
    if (labelIds.includes(label.id)) return true
    return attachLabel(label.id)
  }

  // Everything below is gated on the state describing the task being asked
  // for. Without that, reopening the dialog on a second task would show the
  // first one until its own answer arrived.
  const isCurrent = taskId !== null && loadedId === taskId

  return {
    task: isCurrent ? task : null,
    subtasks: isCurrent ? subtasks : [],
    lists,
    people,
    labels,
    labelIds: isCurrent ? labelIds : [],
    isLoading: taskId !== null && !isCurrent,
    error: isCurrent ? error : null,
    busy,
    reload,
    update,
    setDone,
    addSubtask,
    remove,
    restore,
    attachLabel,
    detachLabel,
    addLabelByName,
  }
}
