import type { Dictionary } from '@/lib/i18n/dictionaries'
import { type TaskMessages } from '@/lib/tasks/model'

/**
 * The dictionary's task errors, in the shape the hooks want.
 *
 * It is a copy rather than a cast because the two shapes answer to different
 * owners: the dictionary is edited by whoever writes the product's words, and
 * {@link TaskMessages} is a contract with the database's `hint` values. Naming
 * every key here is what makes a migration that introduces a new hint fail the
 * build in one place instead of showing "That did not work" in production.
 */
export function taskMessages(dict: Dictionary['tasks']): TaskMessages {
  const errors = dict.errors
  return {
    notAllowed: errors.notAllowed,
    silent: errors.silent,
    unknown: errors.unknown,
    duplicateName: errors.duplicateName,
    subtask_depth: errors.subtask_depth,
    has_subtasks: errors.has_subtasks,
    assignee_not_member: errors.assignee_not_member,
    parent_not_found: errors.parent_not_found,
    task_not_found: errors.task_not_found,
    too_many_lists: errors.too_many_lists,
    too_many_labels: errors.too_many_labels,
    too_many_tasks: errors.too_many_tasks,
    too_many_subtasks: errors.too_many_subtasks,
  }
}
