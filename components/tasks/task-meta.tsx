'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { dueBucket, formatDueShort, type TaskPriority } from '@/lib/tasks/format'
import { cn } from '@/lib/utils'

export type TasksDictionary = Dictionary['tasks']

/**
 * The small pieces every task shares, wherever it is drawn: the agenda, a board
 * column, a subtask line inside the card, the dashboard widget.
 */

/**
 * Priority as a dot rather than a word. "Normal" is the value most tasks carry
 * and drawing a badge on every one of them says nothing; the dot appears only
 * when the priority is worth a glance.
 */
export function PriorityDot({
  priority,
  dict,
  className,
}: {
  priority: TaskPriority
  dict: TasksDictionary
  className?: string
}) {
  if (priority === 'normal') return null

  const tone =
    priority === 'urgent'
      ? 'bg-destructive'
      : priority === 'high'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40'

  return (
    <span
      title={`${dict.priority.label}: ${dict.priority[priority]}`}
      className={cn('size-1.5 shrink-0 rounded-full', tone, className)}
    />
  )
}

/**
 * The due date, coloured by whether it has passed.
 *
 * Both the wording and the colour are decided here, on every render, because
 * neither exists in the database: `due_at` is an instant in UTC, and "overdue"
 * and "today" are statements about the reader's own clock. A date with no time
 * shows no time — a task due "by Friday" must never read "00:00".
 */
export function DueBadge({
  locale,
  dueAt,
  dueHasTime,
  className,
}: {
  locale: Locale
  dueAt: string | null
  dueHasTime: boolean
  className?: string
}) {
  if (!dueAt) return null

  const bucket = dueBucket(dueAt, dueHasTime)
  return (
    <span
      className={cn(
        'shrink-0 text-xs tabular-nums',
        bucket === 'overdue'
          ? 'text-destructive'
          : bucket === 'today'
            ? 'text-foreground'
            : 'text-muted-foreground',
        className
      )}
    >
      {formatDueShort(locale, dueAt, dueHasTime)}
    </span>
  )
}

/** The checkbox, with the title as its label — there is no visible one. */
export function TaskCheckbox({
  title,
  checked,
  disabled,
  onCheckedChange,
  className,
}: {
  title: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <Checkbox
      aria-label={title}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      className={cn('mt-0.5', className)}
    />
  )
}

/** `avatar_url` from whichever provider the person signed up with. */
export function PersonBadge({ name, url }: { name: string | null; url: string | null }) {
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      title={name ?? undefined}
      className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-[10px] font-medium"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  )
}
