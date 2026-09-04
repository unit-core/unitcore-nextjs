'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRightIcon } from 'lucide-react'

import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { DueBadge, PriorityDot, TaskCheckbox } from '@/components/tasks/task-meta'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useOpenTasks } from '@/hooks/use-open-tasks'
import { useSpaces } from '@/hooks/use-spaces'
import { type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { localeHref } from '@/lib/i18n/urls'
import { taskMessages } from '@/lib/tasks/messages'
import { cn } from '@/lib/utils'

/** Enough to be useful at a glance; the rest is one click away. */
const VISIBLE = 8

/** `all`, `inbox`, or a list id. Inbox is `list_id is null`, not a row. */
type Tab = { kind: 'all' } | { kind: 'inbox' } | { kind: 'list'; id: string }

/**
 * Open tasks on the dashboard, switchable by list.
 *
 * It follows the dashboard's own `?space=` filter rather than carrying a second
 * one: with a space chosen the tabs are that space's lists, and with none they
 * are every list the reader can see, each named after the space it belongs to.
 *
 * A client island, like the space filter above it — the rest of the dashboard
 * is rendered on the server from one budget query, and this asks the database
 * a different question entirely.
 */
export function TasksCard({
  spaceId,
  locale,
  dict,
}: {
  spaceId?: string
  locale: Locale
  dict: Dictionary['tasks']
}) {
  const messages = taskMessages(dict)
  const { lists, tasks, isLoading, error, busyTaskId, reload, complete } = useOpenTasks(
    spaceId,
    messages
  )
  const { spaces } = useSpaces()
  const [tab, setTab] = useState<Tab>({ kind: 'all' })
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? ''
  // The space is only worth naming when more than one is in view.
  const listLabel = (name: string, listSpaceId: string) =>
    spaceId ? name : `${spaceName(listSpaceId)} · ${name}`

  const inbox = tasks.filter((task) => task.listId === null)
  const shown =
    tab.kind === 'all'
      ? tasks
      : tab.kind === 'inbox'
        ? inbox
        : tasks.filter((task) => task.listId === tab.id)

  // A tab whose list has just been deleted or archived elsewhere would show an
  // empty card with no way back, so a selection that no longer exists falls
  // back to everything.
  const isStale = tab.kind === 'list' && !lists.some((list) => list.id === tab.id)
  const visible = (isStale ? tasks : shown).slice(0, VISIBLE)

  const chip = (key: string, label: string, count: number, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="max-w-32 truncate">{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )

  return (
    <DashboardCard>
      <CardHeader>
        <CardTitle>{dict.widget.title}</CardTitle>
        <CardDescription>{dict.widget.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chip('all', dict.widget.all, tasks.length, tab.kind === 'all' && !isStale, () =>
            setTab({ kind: 'all' })
          )}
          {inbox.length > 0 &&
            chip('inbox', dict.inbox, inbox.length, tab.kind === 'inbox', () =>
              setTab({ kind: 'inbox' })
            )}
          {lists.map((list) =>
            chip(
              list.id,
              listLabel(list.name, list.spaceId),
              // The view's own counter, which counts root tasks in the database
              // rather than the capped page this card happens to hold.
              list.openCount,
              tab.kind === 'list' && tab.id === list.id && !isStale,
              () => setTab({ kind: 'list', id: list.id })
            )
          )}
        </div>

        {isLoading ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            {dict.loading}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{dict.widget.empty}</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <TaskCheckbox
                  title={task.title}
                  checked={false}
                  disabled={busyTaskId === task.id}
                  onCheckedChange={() => void complete(task.id)}
                />
                <button
                  type="button"
                  onClick={() => setOpenTaskId(task.id)}
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-center gap-1.5">
                    <PriorityDot priority={task.priority} dict={dict} />
                    <span className="truncate text-sm">{task.title}</span>
                  </span>
                  {tab.kind === 'all' && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {task.listName
                        ? listLabel(task.listName, task.spaceId)
                        : spaceId
                          ? dict.inbox
                          : `${spaceName(task.spaceId)} · ${dict.inbox}`}
                    </span>
                  )}
                </button>
                <DueBadge
                  locale={locale}
                  dueAt={task.dueAt}
                  dueHasTime={task.dueHasTime}
                  className="pt-0.5"
                />
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={localeHref(locale, '/tasks')} />}
          className="text-muted-foreground"
        >
          {dict.widget.more}
          <ArrowRightIcon />
        </Button>
      </CardContent>

      <TaskDialog
        taskId={openTaskId}
        locale={locale}
        dict={dict}
        messages={messages}
        onClose={() => setOpenTaskId(null)}
        onChanged={reload}
        onDeleted={() => reload()}
      />
    </DashboardCard>
  )
}
