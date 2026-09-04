'use client'

import { useState } from 'react'
import { ArchiveIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { type TasksDictionary } from '@/components/tasks/task-meta'
import { TaskRow } from '@/components/tasks/task-row'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { type Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/interpolate'
import { type TaskCard, type TaskList } from '@/lib/tasks/model'
import { cn } from '@/lib/utils'

/**
 * The colours a list can be tinted with. A fixed palette rather than a colour
 * picker: these have to stay legible on both themes, and an arbitrary hex from
 * a picker does not.
 */
export const LIST_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
] as const

interface TaskColumnProps {
  /** Null is Inbox: `list_id is null`, a word in the dictionary, not a row. */
  list: TaskList | null
  openTasks: TaskCard[]
  doneTasks: TaskCard[]
  locale: Locale
  dict: TasksDictionary
  busyTaskId: string | null
  isCreating: boolean
  isListBusy: boolean
  dragTaskId: string | null
  onCreateTask: (title: string) => Promise<boolean>
  onToggle: (task: TaskCard, done: boolean) => void
  onOpen: (task: TaskCard) => void
  onDragStart: (task: TaskCard) => void
  onDragEnd: () => void
  /** Dropped on a row: land above it. Dropped on the column: land at the end. */
  onDropBefore: (task: TaskCard) => void
  onDropAtEnd: () => void
  onRename: (name: string) => void
  onRecolor: (color: string | null) => void
  onArchive: () => void
  onRequestDelete: () => void
}

export function TaskColumn({
  list,
  openTasks,
  doneTasks,
  locale,
  dict,
  busyTaskId,
  isCreating,
  isListBusy,
  dragTaskId,
  onCreateTask,
  onToggle,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onDropAtEnd,
  onRename,
  onRecolor,
  onArchive,
  onRequestDelete,
}: TaskColumnProps) {
  const [title, setTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [isOver, setIsOver] = useState(false)

  const name = list?.name ?? dict.inbox
  // The view counts root tasks only, which is what belongs beside a list name.
  // Inbox has no row to count, so it counts what is on screen.
  const openCount = list ? list.openCount : openTasks.length

  /** Enter creates and keeps the focus, so the next one can be typed straight in. */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    if (await onCreateTask(title)) setTitle('')
  }

  const commitRename = () => {
    const next = renaming?.trim()
    setRenaming(null)
    if (next && next !== list?.name) onRename(next)
  }

  return (
    <section
      onDragOver={(event) => {
        if (!dragTaskId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsOver(false)
        onDropAtEnd()
      }}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-[min(var(--radius-4xl),20px)] bg-card p-3 ring-1 ring-foreground/5 dark:ring-foreground/10',
        isOver && 'ring-2 ring-ring/40'
      )}
    >
      <header className="flex items-center gap-2">
        {list?.color && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: list.color }}
          />
        )}

        {renaming !== null ? (
          <Input
            autoFocus
            value={renaming}
            aria-label={dict.list.rename}
            onChange={(event) => setRenaming(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setRenaming(null)
            }}
            className="h-7"
          />
        ) : (
          <h2
            // Double-click to rename, as the spec asks: a list is a word its
            // owner typed, and a settings screen for one field is a detour.
            onDoubleClick={() => list && setRenaming(list.name)}
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            {name}
          </h2>
        )}

        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{openCount}</span>

        {/* Inbox is not a row, so there is nothing to rename, archive or
            delete — and no menu that would offer to. */}
        {list && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label={name} disabled={isListBusy}>
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setRenaming(list.name)}>
                {dict.list.rename}
              </DropdownMenuItem>

              <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                {LIST_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => onRecolor(color)}
                    style={{ backgroundColor: color }}
                    className={cn(
                      'size-4 rounded-full ring-offset-1 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      list.color === color && 'ring-2 ring-foreground'
                    )}
                  />
                ))}
                <button
                  type="button"
                  aria-label={dict.cancel}
                  onClick={() => onRecolor(null)}
                  className="size-4 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onArchive}>
                <ArchiveIcon />
                {dict.list.archive}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onRequestDelete}>
                <Trash2Icon />
                {dict.list.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <ul className="flex flex-col gap-0.5">
        {openTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            locale={locale}
            dict={dict}
            isBusy={busyTaskId === task.id}
            isDragging={dragTaskId === task.id}
            onToggle={(done) => onToggle(task, done)}
            onOpen={() => onOpen(task)}
            onDragStart={() => onDragStart(task)}
            onDragEnd={onDragEnd}
            onDropBefore={() => onDropBefore(task)}
          />
        ))}
      </ul>

      {openTasks.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">{dict.emptyBoard}</p>
      )}

      {/* Closed tasks are folded away by default: a week of them buries the
          three things still to do. */}
      {doneTasks.length > 0 && (
        <div className="space-y-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDone((shown) => !shown)}
            className="w-full justify-start text-muted-foreground"
          >
            {showDone
              ? dict.hideCompleted
              : fill(dict.showCompleted, { count: doneTasks.length })}
          </Button>

          {showDone && (
            <ul className="flex flex-col gap-0.5">
              {doneTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  locale={locale}
                  dict={dict}
                  isBusy={busyTaskId === task.id}
                  onToggle={(done) => onToggle(task, done)}
                  onOpen={() => onOpen(task)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={dict.taskPlaceholder}
          aria-label={dict.addTask}
          disabled={isCreating}
          className="h-7"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label={dict.addTask}
          disabled={isCreating || !title.trim()}
        >
          <PlusIcon />
        </Button>
      </form>
    </section>
  )
}
