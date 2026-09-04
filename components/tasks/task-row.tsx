'use client'

import { useState } from 'react'

import {
  DueBadge,
  PersonBadge,
  PriorityDot,
  TaskCheckbox,
  type TasksDictionary,
} from '@/components/tasks/task-meta'
import { type Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/interpolate'
import { type TaskCard } from '@/lib/tasks/model'
import { cn } from '@/lib/utils'

interface TaskRowProps {
  task: TaskCard
  locale: Locale
  dict: TasksDictionary
  isBusy: boolean
  onToggle: (done: boolean) => void
  onOpen: () => void
  /** Dragging is optional: the agenda lists tasks it cannot reorder. */
  onDragStart?: () => void
  onDragEnd?: () => void
  /** The card was dropped on this row, meaning "put it above me". */
  onDropBefore?: () => void
  isDragging?: boolean
}

/**
 * One task, as a board column draws it.
 *
 * The whole row is a button so the card opens from anywhere on it, with the
 * checkbox sitting outside that button — closing a task and opening it are
 * different intentions, and nesting one control inside another is invalid
 * markup besides.
 */
export function TaskRow({
  task,
  locale,
  dict,
  isBusy,
  onToggle,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropBefore,
  isDragging,
}: TaskRowProps) {
  const [isOver, setIsOver] = useState(false)
  const canDrag = Boolean(onDragStart)

  return (
    <li
      draggable={canDrag}
      onDragStart={(event) => {
        // Firefox starts no drag at all without payload on the transfer.
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={() => {
        setIsOver(false)
        onDragEnd?.()
      }}
      onDragOver={(event) => {
        if (!onDropBefore) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        if (!onDropBefore) return
        event.preventDefault()
        event.stopPropagation()
        setIsOver(false)
        onDropBefore()
      }}
      className={cn(
        'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60',
        isDragging && 'opacity-40',
        isOver && 'ring-2 ring-ring/40',
        canDrag && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <TaskCheckbox
        title={task.title}
        checked={task.isDone}
        disabled={isBusy}
        onCheckedChange={onToggle}
      />

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            'block truncate text-sm',
            task.isDone && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </span>

        {(task.subtaskCount > 0 || task.dueAt || task.assigneeName) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {task.subtaskCount > 0 && (
              // Straight from the view's counters: a second query per row to
              // count subtasks is exactly what those columns exist to avoid.
              <span className="text-xs text-muted-foreground">
                ▸{' '}
                {fill(dict.subtaskProgress, {
                  done: task.subtaskDoneCount,
                  count: task.subtaskCount,
                })}
              </span>
            )}
            <DueBadge locale={locale} dueAt={task.dueAt} dueHasTime={task.dueHasTime} />
          </span>
        )}
      </button>

      <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <PriorityDot priority={task.priority} dict={dict} />
        {task.assigneeName && (
          <PersonBadge name={task.assigneeName} url={task.assigneeAvatar} />
        )}
      </span>
    </li>
  )
}
