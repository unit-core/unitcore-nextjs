'use client'

import { useState } from 'react'
import { CheckIcon, ChevronDownIcon, PlusIcon, XIcon } from 'lucide-react'

import {
  DueBadge,
  PersonBadge,
  TaskCheckbox,
  type TasksDictionary,
} from '@/components/tasks/task-meta'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTask, type TaskPerson } from '@/hooks/use-task'
import { type Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/interpolate'
import { PRIORITIES, formatMoment, toDateInput, toTimeInput, fromDateInputs } from '@/lib/tasks/format'
import { type TaskCard, type TaskMessages } from '@/lib/tasks/model'
import { cn } from '@/lib/utils'

interface TaskDialogProps {
  /** The open task, or null when the dialog is closed. */
  taskId: string | null
  locale: Locale
  dict: TasksDictionary
  messages: TaskMessages
  onClose: () => void
  /** Something was written; whatever opened this should reread. */
  onChanged: () => void
  /** Soft-deleted, and the caller owns the undo. */
  onDeleted: (taskId: string) => void
}

/** A field row: a label on the left, whatever changes it on the right. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function MenuButton({
  children,
  disabled,
}: {
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <DropdownMenuTrigger
      render={
        <Button variant="outline" size="sm" disabled={disabled} className="max-w-full">
          <span className="truncate">{children}</span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      }
    />
  )
}

const personName = (person: TaskPerson, dict: TasksDictionary) =>
  person.displayName?.trim() || dict.unnamed

/**
 * The task card: everything one task has, over whatever screen opened it.
 *
 * Nothing here re-implements a server rule. The list field is not shown for a
 * subtask because a subtask has no list of its own — not because a check here
 * would refuse it — and the "add subtask" field is absent for the same reason,
 * one level down. When the database does refuse something anyway, the sentence
 * it produced is shown; it is not predicted.
 */
export function TaskDialog({
  taskId,
  locale,
  dict,
  messages,
  onClose,
  onChanged,
  onDeleted,
}: TaskDialogProps) {
  const task = useTask(taskId, messages)

  return (
    <Dialog
      open={taskId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        {task.isLoading && !task.task ? (
          <>
            <DialogTitle className="sr-only">{dict.loading}</DialogTitle>
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              {dict.loading}
            </p>
          </>
        ) : !task.task ? (
          <>
            <DialogTitle>{dict.errors.task_not_found}</DialogTitle>
            <DialogDescription>{dict.errors.silent}</DialogDescription>
          </>
        ) : (
          <TaskDialogBody
            key={task.task.id}
            task={task.task}
            card={task}
            locale={locale}
            dict={dict}
            onChanged={onChanged}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TaskDialogBody({
  task,
  card,
  locale,
  dict,
  onChanged,
  onClose,
  onDeleted,
}: {
  task: TaskCard
  card: ReturnType<typeof useTask>
  locale: Locale
  dict: TasksDictionary
  onChanged: () => void
  onClose: () => void
  onDeleted: (taskId: string) => void
}) {
  const { subtasks, lists, people, labels, labelIds, busy, error } = card

  // Null means "follow the server": the field shows what came back until
  // something is typed into it, and goes back to following after a save, so a
  // change made elsewhere is never overwritten by a stale draft sitting here.
  const [draftTitle, setDraftTitle] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const title = draftTitle ?? task.title
  const notes = draftNotes ?? task.notes ?? ''
  const isSubtask = task.parentId !== null
  const saving = busy?.kind === 'save'

  const save = async (patch: Parameters<typeof card.update>[0]) => {
    const ok = await card.update(patch)
    if (ok) onChanged()
    return ok
  }

  const saveTitle = async () => {
    const next = title.trim()
    if (!next || next === task.title) {
      setDraftTitle(null)
      return
    }
    if (await save({ title: next })) setDraftTitle(null)
  }

  const saveNotes = async () => {
    const next = notes.trim() || null
    if (next === (task.notes ?? null)) {
      setDraftNotes(null)
      return
    }
    if (await save({ notes: next })) setDraftNotes(null)
  }

  const saveDue = async (date: string, time: string) => {
    // Clearing the date clears the flag with it: the database will not hold a
    // "has a time" that has no moment to attach to.
    if (!date) {
      await save({ dueAt: null, dueHasTime: false })
      return
    }
    const parsed = fromDateInputs(date, time)
    if (parsed) await save({ dueAt: parsed.dueAt, dueHasTime: parsed.dueHasTime })
  }

  const toggle = async (id: string, done: boolean) => {
    if (await card.setDone(id, done)) onChanged()
  }

  const addSubtask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newSubtask.trim()) return
    if (await card.addSubtask(newSubtask)) {
      setNewSubtask('')
      onChanged()
    }
  }

  const addLabel = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newLabel.trim()) return
    if (await card.addLabelByName(newLabel)) setNewLabel('')
  }

  const remove = async () => {
    if (await card.remove(task.id)) {
      onDeleted(task.id)
      onChanged()
      onClose()
    }
  }

  const currentList = lists.find((list) => list.id === task.listId)
  const attached = labels.filter((label) => labelIds.includes(label.id))
  const available = labels.filter((label) => !labelIds.includes(label.id))
  const dueDate = toDateInput(task.dueAt)
  const dueTime = task.dueHasTime ? toTimeInput(task.dueAt) : ''

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-2">
          <TaskCheckbox
            title={task.title}
            checked={task.isDone}
            disabled={busy?.kind === 'complete'}
            onCheckedChange={(next) => void toggle(task.id, next)}
            className="mt-2"
          />
          {/* The dialog's accessible name is the title as the server last sent
              it; the field beside it is what changes that title. Making the
              heading itself the input would leave the popup named by whatever
              is half-typed into it. */}
          <DialogTitle className="sr-only">{task.title}</DialogTitle>
          <input
            value={title}
            aria-label={dict.taskPlaceholder}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setDraftTitle(null)
            }}
            disabled={saving}
            className={cn(
              'w-full rounded-md bg-transparent px-1 py-1 font-heading text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              task.isDone && 'text-muted-foreground line-through'
            )}
          />
        </div>
      </DialogHeader>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-2.5">
        {/* Hidden for a subtask, whose list is its parent's and always will be:
            the column is null in the table and the trigger keeps it that way. */}
        {!isSubtask && (
          <Field label={dict.list.label}>
            <DropdownMenu>
              <MenuButton disabled={saving}>{currentList?.name ?? dict.inbox}</MenuButton>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => void save({ listId: null })}>
                  {dict.inbox}
                  {task.listId === null && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
                {lists.length > 0 && <DropdownMenuSeparator />}
                {lists.map((list) => (
                  <DropdownMenuItem key={list.id} onClick={() => void save({ listId: list.id })}>
                    <span className="truncate">{list.name}</span>
                    {task.listId === list.id && <CheckIcon className="ml-auto size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
        )}

        {/* Members of this space, and nobody else. Free text here would be a
            field that exists to be refused: an outsider is `23514`. */}
        <Field label={dict.assignee}>
          <DropdownMenu>
            <MenuButton disabled={saving}>{task.assigneeName ?? dict.unassigned}</MenuButton>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => void save({ assigneeId: null })}>
                {dict.unassigned}
                {task.assigneeId === null && <CheckIcon className="ml-auto size-4" />}
              </DropdownMenuItem>
              {people.length > 0 && <DropdownMenuSeparator />}
              {people.map((person) => (
                <DropdownMenuItem
                  key={person.userId}
                  onClick={() => void save({ assigneeId: person.userId })}
                >
                  <PersonBadge name={person.displayName} url={person.avatarUrl} />
                  <span className="truncate">{personName(person, dict)}</span>
                  {task.assigneeId === person.userId && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field label={dict.dueDate}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={dueDate}
              aria-label={dict.dueDate}
              disabled={saving}
              onChange={(event) => void saveDue(event.target.value, dueTime)}
              className="w-40"
            />
            <Input
              type="time"
              value={dueTime}
              aria-label={dict.dueTime}
              // A time with no day has nothing to attach to, so the field waits
              // for a date rather than offering to write half a due date.
              disabled={saving || !dueDate}
              onChange={(event) => void saveDue(dueDate, event.target.value)}
              className="w-28"
            />
            {task.dueAt && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={dict.clearDue}
                disabled={saving}
                onClick={() => void save({ dueAt: null, dueHasTime: false })}
              >
                <XIcon />
              </Button>
            )}
          </div>
        </Field>

        <Field label={dict.priority.label}>
          <DropdownMenu>
            <MenuButton disabled={saving}>{dict.priority[task.priority]}</MenuButton>
            <DropdownMenuContent align="start" className="w-40">
              {PRIORITIES.map((priority) => (
                <DropdownMenuItem key={priority} onClick={() => void save({ priority })}>
                  {dict.priority[priority]}
                  {task.priority === priority && <CheckIcon className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`notes-${task.id}`}>{dict.notes}</Label>
        <textarea
          id={`notes-${task.id}`}
          value={notes}
          rows={3}
          placeholder={dict.notesPlaceholder}
          disabled={saving}
          onChange={(event) => setDraftNotes(event.target.value)}
          onBlur={() => void saveNotes()}
          className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{dict.labels}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {attached.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
              style={label.color ? { borderColor: label.color } : undefined}
            >
              {label.name}
              <button
                type="button"
                aria-label={`${dict.labels}: ${label.name}`}
                disabled={busy?.kind === 'label'}
                onClick={() => void card.detachLabel(label.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}

          {available.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-xs" aria-label={dict.addLabel}>
                    <PlusIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-48">
                {available.map((label) => (
                  <DropdownMenuItem
                    key={label.id}
                    onClick={() => void card.attachLabel(label.id)}
                  >
                    <span className="truncate">{label.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Names are the user's own data and are never translated, so this is
            free text with a name-shaped uniqueness rule behind it: typing one
            that exists attaches that label instead of refusing. */}
        <form onSubmit={addLabel} className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder={dict.labelPlaceholder}
            aria-label={dict.labelPlaceholder}
            className="h-7"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!newLabel.trim()}>
            {dict.addLabel}
          </Button>
        </form>
      </div>

      {/* One level down there is nothing to add to, and the database says so
          with `hint: subtask_depth`. The field is absent rather than disabled. */}
      {!isSubtask && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {dict.subtasks}
            {task.subtaskCount > 0 &&
              ` · ${fill(dict.subtaskProgress, {
                done: task.subtaskDoneCount,
                count: task.subtaskCount,
              })}`}
          </span>

          <ul className="space-y-1">
            {subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-start gap-2 text-sm">
                <TaskCheckbox
                  title={subtask.title}
                  checked={subtask.isDone}
                  disabled={busy?.kind === 'complete'}
                  onCheckedChange={(next) => void toggle(subtask.id, next)}
                />
                <span className={cn('flex-1', subtask.isDone && 'text-muted-foreground line-through')}>
                  {subtask.title}
                </span>
                <DueBadge locale={locale} dueAt={subtask.dueAt} dueHasTime={subtask.dueHasTime} />
              </li>
            ))}
          </ul>

          <form onSubmit={addSubtask} className="flex gap-2">
            <Input
              value={newSubtask}
              onChange={(event) => setNewSubtask(event.target.value)}
              placeholder={dict.addSubtask}
              aria-label={dict.addSubtask}
              disabled={busy?.kind === 'subtask'}
              className="h-7"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={busy?.kind === 'subtask' || !newSubtask.trim()}
            >
              <PlusIcon />
            </Button>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <p>
          {task.createdByName && fill(dict.createdBy, { name: task.createdByName })}
          {task.isDone &&
            task.completedByName &&
            task.completedAt &&
            ` · ${fill(dict.completedBy, {
              name: task.completedByName,
              date: formatMoment(locale, task.completedAt),
            })}`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy?.kind === 'delete'}
          onClick={() => void remove()}
          className="text-destructive hover:text-destructive"
        >
          {dict.deleteTask}
        </Button>
      </div>
    </>
  )
}
