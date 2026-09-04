import type { PostgrestError } from '@supabase/supabase-js'

import { taskRefusal } from '@/lib/supabase/errors'
import { isPriority, toNumber, type TaskPriority } from '@/lib/tasks/format'

/**
 * The shapes the `tasks` schema answers with, and the shapes the rest of the
 * client works in.
 *
 * Everything here is read through `.schema('tasks')`. Forgetting that lands in
 * `public`, where none of these relations exist, and PostgREST answers
 * `PGRST205` — the single most common mistake in the first hour with a schema
 * that is not `public`.
 */
export const TASKS_SCHEMA = 'tasks'

/** Every column of `tasks.task_cards`, spelled once. */
export const TASK_CARD_COLUMNS =
  'id, space_id, list_id, list_name, parent_id, title, notes, priority, due_at, due_has_time, ' +
  'position, assignee_id, assignee_name, assignee_avatar, is_mine, is_done, completed_at, ' +
  'completed_by_name, created_by, created_by_name, subtask_count, subtask_done_count, ' +
  'created_at, updated_at'

export const LIST_CARD_COLUMNS =
  'id, space_id, name, color, position, archived_at, open_count, total_count, created_at, updated_at'

export const AGENDA_COLUMNS =
  'id, space_id, space_name, list_id, list_name, parent_id, title, priority, due_at, due_has_time, created_at'

export interface TaskCardRow {
  id: string
  space_id: string
  list_id: string | null
  list_name: string | null
  parent_id: string | null
  title: string
  notes: string | null
  priority: string
  due_at: string | null
  due_has_time: boolean
  position: string | number
  assignee_id: string | null
  assignee_name: string | null
  assignee_avatar: string | null
  is_mine: boolean
  is_done: boolean
  completed_at: string | null
  completed_by_name: string | null
  created_by: string | null
  created_by_name: string | null
  subtask_count: number
  subtask_done_count: number
  created_at: string
  updated_at: string
}

export interface ListCardRow {
  id: string
  space_id: string
  name: string
  color: string | null
  position: string | number
  archived_at: string | null
  open_count: number
  total_count: number
  created_at: string
  updated_at: string
}

export interface AgendaRow {
  id: string
  space_id: string
  space_name: string
  list_id: string | null
  list_name: string | null
  parent_id: string | null
  title: string
  priority: string
  due_at: string | null
  due_has_time: boolean
  created_at: string
}

/**
 * A task as the screens use it.
 *
 * `listId` is the one field the view improves on the table: a subtask stores
 * `null` there and the view fills in its parent's list, so nothing here has to
 * join back to the parent to know which column a subtask belongs under.
 */
export interface TaskCard {
  id: string
  spaceId: string
  listId: string | null
  listName: string | null
  parentId: string | null
  title: string
  notes: string | null
  priority: TaskPriority
  dueAt: string | null
  dueHasTime: boolean
  position: number
  /**
   * The position exactly as `numeric` serialised it. Kept beside the number
   * because the number cannot answer the question §5.6 asks: a double has run
   * out of significant digits long before the column has, so how far the
   * fraction has degraded is only visible in the string.
   */
  positionRaw: string
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatar: string | null
  /** Assigned to the reader. Decided by the view, from `auth.uid()`. */
  isMine: boolean
  isDone: boolean
  completedAt: string | null
  completedByName: string | null
  createdByName: string | null
  /** Undeleted subtasks, and how many of them are closed. */
  subtaskCount: number
  subtaskDoneCount: number
  createdAt: string
}

export interface TaskList {
  id: string
  spaceId: string
  name: string
  color: string | null
  position: number
  archivedAt: string | null
  /** Root tasks only: a subtask has no `list_id` of its own to be counted by. */
  openCount: number
  totalCount: number
}

export interface AgendaItem {
  id: string
  spaceId: string
  spaceName: string
  listId: string | null
  listName: string | null
  parentId: string | null
  title: string
  priority: TaskPriority
  dueAt: string | null
  dueHasTime: boolean
  createdAt: string
}

export const toTaskCard = (row: TaskCardRow): TaskCard => ({
  id: row.id,
  spaceId: row.space_id,
  listId: row.list_id,
  listName: row.list_name,
  parentId: row.parent_id,
  title: row.title,
  notes: row.notes,
  priority: isPriority(row.priority) ? row.priority : 'normal',
  dueAt: row.due_at,
  dueHasTime: row.due_has_time,
  position: toNumber(row.position),
  positionRaw: String(row.position),
  assigneeId: row.assignee_id,
  assigneeName: row.assignee_name,
  assigneeAvatar: row.assignee_avatar,
  isMine: row.is_mine,
  isDone: row.is_done,
  completedAt: row.completed_at,
  completedByName: row.completed_by_name,
  createdByName: row.created_by_name,
  subtaskCount: Number(row.subtask_count ?? 0),
  subtaskDoneCount: Number(row.subtask_done_count ?? 0),
  createdAt: row.created_at,
})

export const toTaskList = (row: ListCardRow): TaskList => ({
  id: row.id,
  spaceId: row.space_id,
  name: row.name,
  color: row.color,
  position: toNumber(row.position),
  archivedAt: row.archived_at,
  openCount: Number(row.open_count ?? 0),
  totalCount: Number(row.total_count ?? 0),
})

export const toAgendaItem = (row: AgendaRow): AgendaItem => ({
  id: row.id,
  spaceId: row.space_id,
  spaceName: row.space_name,
  listId: row.list_id,
  listName: row.list_name,
  parentId: row.parent_id,
  title: row.title,
  priority: isPriority(row.priority) ? row.priority : 'normal',
  dueAt: row.due_at,
  dueHasTime: row.due_has_time,
  createdAt: row.created_at,
})

/**
 * Every sentence a task screen can have to show. The hooks hold none of them:
 * the dictionary is a server concern, and a hook that imported it would drag
 * `next/root-params` into the browser.
 *
 * The keys under `errors` are named exactly as the `hint` the trigger raises,
 * which is what lets {@link taskRefusal} look one up without a mapping table.
 */
export interface TaskMessages {
  /**
   * Open on purpose: {@link taskRefusal} looks a sentence up by the `hint` the
   * database raised, and a migration can add a hint before this file knows
   * about it. The named keys below are the ones that exist today.
   */
  [hint: string]: string
  notAllowed: string
  silent: string
  unknown: string
  duplicateName: string
  subtask_depth: string
  has_subtasks: string
  assignee_not_member: string
  parent_not_found: string
  task_not_found: string
  too_many_lists: string
  too_many_labels: string
  too_many_tasks: string
  too_many_subtasks: string
}

export type WriteOutcome = { ok: true } | { ok: false; message: string }

/**
 * Whether a write actually happened, and what to say when it did not.
 *
 * Two different failures arrive by two different routes. A rule the database
 * enforces raises an exception and comes back in `error`. A row RLS does not
 * let through never reaches the statement at all: `UPDATE` and `DELETE` see
 * only what the policy's USING clause admits, so PostgREST answers **zero rows
 * and no error**, which reads exactly like success. That is why every mutation
 * ends in `.select()` — without it there is nothing to count, and a refusal
 * would be reported as a change that never happened.
 */
export function checkWrite(
  result: { data: unknown[] | null; error: PostgrestError | null },
  messages: TaskMessages
): WriteOutcome {
  if (result.error) return { ok: false, message: taskRefusal(result.error, messages) }
  if (!result.data?.length) return { ok: false, message: messages.silent }
  return { ok: true }
}

/** The refusal for a read, where "zero rows" is an answer rather than a fault. */
export function readRefusal(error: PostgrestError, messages: TaskMessages): string {
  return taskRefusal(error, messages)
}
