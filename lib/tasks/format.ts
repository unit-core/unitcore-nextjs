import { type Locale } from '@/lib/i18n/config'

/** `tasks.task_priority`, in the order the enum declares it. */
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type TaskPriority = (typeof PRIORITIES)[number]

export function isPriority(value: string | null | undefined): value is TaskPriority {
  return value !== null && value !== undefined && (PRIORITIES as readonly string[]).includes(value)
}

/**
 * `position` is `numeric`, and PostgREST serialises numerics as strings — the
 * same trap `amount` falls into in lib/budget/dashboard.ts. Sorting the raw
 * value would order `1024` before `512`, so every read goes through here.
 */
export function toNumber(value: string | number | null | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

/**
 * Where a task belongs on the agenda. Nothing of the sort is stored: the
 * database keeps an instant in UTC, and both "overdue" and "today" are answers
 * about the reader's own clock, so they are decided here on every read.
 */
export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'none'

export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'today', 'upcoming', 'none']

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

const DAY = 24 * 60 * 60 * 1000

/** Whole calendar days from today to `date`, in the browser's zone. */
function calendarDayDiff(date: Date, now: Date): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / DAY)
}

/**
 * A date without a time is a whole day, so it is late only once that day is
 * over — a task "by Friday" is not overdue at one minute past midnight on
 * Friday. A task with a time is late the moment it passes.
 */
export function dueBucket(
  dueAt: string | null,
  dueHasTime: boolean,
  now: Date = new Date()
): DueBucket {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return 'none'

  const days = calendarDayDiff(due, now)
  if (!dueHasTime) return days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming'
  if (due.getTime() < now.getTime()) return 'overdue'
  return days === 0 ? 'today' : 'upcoming'
}

/**
 * The short form the agenda and the board show: a time for today, a word for
 * the days around it, a date beyond that.
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'` is what says "вчера" instead
 * of "1 день назад", so those words need no dictionary keys of their own and
 * arrive translated for any locale the project adds later.
 */
export function formatDueShort(
  locale: Locale,
  dueAt: string,
  dueHasTime: boolean,
  now: Date = new Date()
): string {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return ''

  const days = calendarDayDiff(due, now)
  const time = dueHasTime
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(due)
    : null

  if (days === 0 && time) return time
  if (Math.abs(days) <= 6) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
    return time ? `${word}, ${time}` : word
  }

  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    // A due date more than a year out is rare enough that the year is worth
    // the four characters only when it is not this one.
    ...(due.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(due)
  return time ? `${date}, ${time}` : date
}

/** The long form the task card shows: `5 сентября, 18:00`. */
export function formatDueFull(locale: Locale, dueAt: string, dueHasTime: boolean): string {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(dueHasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(due)
}

/** `2026-09-04T…` -> `4 сентября 2026`, for "created by" and "closed on". */
export function formatMoment(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))
}

/** `<input type="date">` wants the local calendar day, not the UTC one. */
export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `<input type="time">`, likewise local. */
export function toTimeInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The two inputs back into the instant the database stores.
 *
 * A day with no time is pinned at local noon rather than midnight. The column
 * is a `timestamptz`, so whatever is written is read back in somebody else's
 * zone eventually, and noon is the only hour that survives every offset on
 * Earth as the same calendar day. Midnight would show the day before to half
 * the planet, and the end of the day would show the day after to the other
 * half. Whether it is late is not decided from this value's hour anyway —
 * {@link dueBucket} compares whole days for exactly this reason.
 */
export function fromDateInputs(date: string, time: string): { dueAt: string; dueHasTime: boolean } | null {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null

  if (time) {
    const [hours, minutes] = time.split(':').map(Number)
    return {
      dueAt: new Date(year, month - 1, day, hours || 0, minutes || 0).toISOString(),
      dueHasTime: true,
    }
  }
  return { dueAt: new Date(year, month - 1, day, 12).toISOString(), dueHasTime: false }
}

/**
 * Fractional positions degrade: inserting between two neighbours halves the
 * gap, and a column that is reordered often ends up with positions no `numeric`
 * should have to carry. Past this many characters the column is renumbered in
 * one batch — cheaper than a background job, which has nowhere to run: pg_cron
 * is not installed in this project.
 */
export const POSITION_DIGITS_LIMIT = 30

/** The step a fresh column is renumbered with, matching the trigger's default. */
export const POSITION_STEP = 1024

export function needsRenumber(positions: Array<string | number>): boolean {
  return positions.some((value) => String(value).length > POSITION_DIGITS_LIMIT)
}

/**
 * The position for a card dropped between two neighbours. Undefined ends mean
 * the edges of the column: before the first, or after the last.
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return POSITION_STEP
  if (before === undefined) return after! - POSITION_STEP
  if (after === undefined) return before + POSITION_STEP
  return (before + after) / 2
}
