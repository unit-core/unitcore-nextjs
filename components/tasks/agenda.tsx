'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ListChecksIcon } from 'lucide-react'

import { TaskDialog } from '@/components/tasks/task-dialog'
import { DueBadge, TaskCheckbox, PriorityDot, type TasksDictionary } from '@/components/tasks/task-meta'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAgenda } from '@/hooks/use-agenda'
import { useSpaces } from '@/hooks/use-spaces'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { DUE_BUCKETS, dueBucket, type DueBucket } from '@/lib/tasks/format'
import { taskMessages } from '@/lib/tasks/messages'
import { type AgendaItem } from '@/lib/tasks/model'
import { cn } from '@/lib/utils'

const GROUP_LABEL: Record<DueBucket, 'overdue' | 'today' | 'upcoming' | 'noDueDate'> = {
  overdue: 'overdue',
  today: 'today',
  upcoming: 'upcoming',
  none: 'noDueDate',
}

/**
 * "My tasks": everything assigned to the reader, across every space at once.
 *
 * The four groups are computed here and nowhere else. The database stores an
 * instant in UTC and knows nothing about anyone's time zone, so "overdue" and
 * "today" are answers about the clock in this browser — which is also why they
 * are recomputed on every render rather than cached with the rows.
 */
export function Agenda({ dict }: { dict: TasksDictionary }) {
  const locale = useLocale()
  const agenda = useAgenda(taskMessages(dict))
  const { spaces } = useSpaces()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const now = new Date()
  const groups = DUE_BUCKETS.map((bucket) => ({
    bucket,
    items: agenda.items.filter((item) => dueBucket(item.dueAt, item.dueHasTime, now) === bucket),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{dict.title}</h1>
          <p className="text-sm text-muted-foreground">{dict.subtitle}</p>
        </div>

        {/* The way into a board. Every space the reader belongs to is listed:
            a task lives inside a space, and there is no view that spans them
            for writing the way my_agenda does for reading. */}
        {spaces.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {spaces.map((space) => (
              <Button
                key={space.id}
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={localeHref(locale, `/tasks/${space.id}`)} />}
              >
                <span className="max-w-40 truncate">{space.name}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {agenda.error && (
        <p role="alert" className="text-sm text-destructive">
          {agenda.error}
        </p>
      )}

      {agenda.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {dict.loading}
        </p>
      ) : groups.length === 0 ? (
        <Empty className="rounded-[min(var(--radius-4xl),24px)] bg-card py-16 shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>{dict.empty}</EmptyTitle>
            <EmptyDescription>{dict.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.bucket} className="space-y-1">
              <h2
                className={cn(
                  'px-2 text-xs font-medium tracking-wide uppercase',
                  group.bucket === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {dict[GROUP_LABEL[group.bucket]]} ({group.items.length})
              </h2>
              <ul className="rounded-[min(var(--radius-4xl),20px)] bg-card p-2 ring-1 ring-foreground/5 dark:ring-foreground/10">
                {group.items.map((item) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    dict={dict}
                    isBusy={agenda.busy?.kind === 'complete' && agenda.busy.taskId === item.id}
                    onComplete={() => void agenda.complete(item.id)}
                    onOpen={() => setOpenTaskId(item.id)}
                    locale={locale}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TaskDialog
        taskId={openTaskId}
        locale={locale}
        dict={dict}
        messages={taskMessages(dict)}
        onClose={() => setOpenTaskId(null)}
        onChanged={agenda.reload}
        // No undo bar here: the agenda has no trash of its own to point at, and
        // the board that owns the task does. The row simply leaves the list.
        onDeleted={() => agenda.reload()}
      />
    </div>
  )
}

function AgendaRow({
  item,
  dict,
  locale,
  isBusy,
  onComplete,
  onOpen,
}: {
  item: AgendaItem
  dict: TasksDictionary
  locale: ReturnType<typeof useLocale>
  isBusy: boolean
  onComplete: () => void
  onOpen: () => void
}) {
  // `list_name` is empty for Inbox, which is not a list — the caption says the
  // space alone rather than inventing a name for something that has none.
  const where = item.listName ? `${item.spaceName} · ${item.listName}` : item.spaceName

  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
      <TaskCheckbox title={item.title} checked={false} disabled={isBusy} onCheckedChange={onComplete} />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-1.5">
          <PriorityDot priority={item.priority} dict={dict} />
          <span className="truncate text-sm">{item.title}</span>
        </span>
      </button>
      <DueBadge locale={locale} dueAt={item.dueAt} dueHasTime={item.dueHasTime} className="pt-0.5" />
      <span className="hidden max-w-48 shrink-0 truncate pt-0.5 text-xs text-muted-foreground sm:block">
        {where}
      </span>
    </li>
  )
}
