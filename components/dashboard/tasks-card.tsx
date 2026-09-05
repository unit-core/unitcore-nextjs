'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRightIcon, PlusIcon } from 'lucide-react'

import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { DueBadge, PriorityDot, TaskCheckbox } from '@/components/tasks/task-meta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useDashboardTasks, type Settling } from '@/hooks/use-dashboard-tasks'
import { useSpaces } from '@/hooks/use-spaces'
import { type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { fill } from '@/lib/i18n/interpolate'
import { localeHref } from '@/lib/i18n/urls'
import { taskMessages } from '@/lib/tasks/messages'
import { type TaskCard } from '@/lib/tasks/model'
import { cn } from '@/lib/utils'

/** Enough to be useful at a glance; the rest is one click away. */
const VISIBLE = 8

/** `all`, `inbox`, or a list id. Inbox is `list_id is null`, not a row. */
type Tab = { kind: 'all' } | { kind: 'inbox' } | { kind: 'list'; id: string }

/**
 * A row that can fold itself away.
 *
 * `grid-rows-[1fr] → [0fr]` is the one way to animate the height of content
 * nobody has measured; a plain `height` transition needs a number, and an
 * element removed from the array cannot animate at all — which is why the hook
 * holds the row for a moment longer than the database needs it.
 *
 * `motion-reduce` drops the movement and keeps the timing: the three seconds
 * are there so the reader can change their mind, which is not an animation.
 */
function CollapsingRow({ leaving, children }: { leaving: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'grid transition-all duration-300 ease-out motion-reduce:transition-none',
        leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      )}
      // Half-collapsed is not a target: the checkbox is still in the DOM for
      // another 300ms and should not be tappable while it shrinks.
      aria-hidden={leaving || undefined}
    >
      <div className={cn('overflow-hidden', leaving && 'pointer-events-none')}>{children}</div>
    </li>
  )
}

/**
 * Tasks on the dashboard, by list, with what has been closed folded underneath.
 *
 * Two axes, kept apart. The chips say **which list** — "All" and "Inbox" among
 * them, neither of which is a list, because Inbox is `list_id is null`. The
 * toggle under the rows says **which state**. They compose: Shopping plus
 * closed is Shopping's closed tasks, which a single row of chips mixing both
 * could not have expressed. It is the same pair of controls a board column
 * already offers, so the two surfaces read alike.
 *
 * It follows the dashboard's own `?space=` filter rather than carrying a second
 * one. A client island, like the space filter above it — the rest of the page
 * is rendered on the server from one budget query, and this asks the database a
 * different question entirely.
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
  const {
    lists,
    openTasks,
    doneTasks,
    settling,
    leaving,
    isLoading,
    error,
    created,
    busyTaskId,
    reload,
    setDone,
    createTask,
    isOpenCapped,
    isDoneCapped,
  } = useDashboardTasks(spaceId, messages)
  const { spaces } = useSpaces()
  const [tab, setTab] = useState<Tab>({ kind: 'all' })
  const [showDone, setShowDone] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? ''
  // The space is only worth naming when more than one is in view.
  const listLabel = (name: string, listSpaceId: string) =>
    spaceId ? name : `${spaceName(listSpaceId)} · ${name}`

  // A tab whose list has just been deleted or archived elsewhere would show an
  // empty card with no way back, so a selection that no longer exists falls
  // back to everything.
  const isStale = tab.kind === 'list' && !lists.some((list) => list.id === tab.id)
  const inTab = (task: TaskCard) => {
    if (isStale || tab.kind === 'all') return true
    if (tab.kind === 'inbox') return task.listId === null
    return task.listId === tab.id
  }

  /**
   * What the checkbox shows. While a row is settling the database already
   * agrees with the tick, and the row is only still here so the eye can follow
   * it — so the tick leads and `is_done` catches up when it lands.
   */
  const isTicked = (task: TaskCard) => {
    const state: Settling | undefined = settling[task.id]
    return state ? state === 'completing' : task.isDone
  }

  /**
   * Two different questions, deliberately answered differently.
   *
   * A row is **drawn** where the eye last saw it, so nothing jumps. A row is
   * **counted** where it already belongs, so the numbers never lie about what
   * the database holds. During the three seconds between, the count leaves one
   * side and joins the other while the row is still visibly travelling — which
   * is the whole answer to "where did it go".
   *
   * Both counts read `isTicked`, the same answer the checkbox gives, so a
   * number and a tick can never disagree.
   */
  const everything = [...openTasks, ...doneTasks]
  const openCount = everything.filter((task) => !isTicked(task))
  const doneCount = everything.filter(isTicked)

  const openRows = openTasks.filter(inTab)
  const doneRows = doneTasks.filter(inTab)

  /**
   * A number the query may have cut short.
   *
   * Both reads stop at a limit, so past it the card holds fewer rows than the
   * space does and every count derived from them is short by an unknown
   * amount. `200+` says where the answer stops; a bare `200` would be a lie
   * with a confident face on it.
   */
  const counted = (value: number, capped: boolean) => (capped ? `${value}+` : String(value))

  /**
   * The tail the card has no room for.
   *
   * Eight rows under a chip reading `47` is the confusing part — not that the
   * card is short, but that it never said so. The eight are the ones worth
   * seeing: open tasks come back ordered by due date, closed ones by when they
   * were closed.
   */
  const overflow = (hidden: number, capped: boolean) =>
    hidden > 0 ? (
      <li className="px-2 pt-1.5 text-xs text-muted-foreground">
        {fill(dict.widget.overflow, { count: counted(hidden, capped) })}
      </li>
    ) : null

  /**
   * A task written here has no due date, so it sorts to the very end — past the
   * cap the moment the card holds more than eight. Typing something in and
   * seeing only a number change is indistinguishable from it not having saved,
   * so anything created in this session is drawn whether or not it fits, right
   * above the field it was typed into.
   */
  const openVisible = openRows.slice(0, VISIBLE)
  const openShown = [
    ...openVisible,
    ...openRows.filter((task) => created[task.id] && !openVisible.includes(task)),
  ]

  /**
   * Where a task typed here would go.
   *
   * `list_id` is nullable and null means Inbox, so the list half is easy.
   * `space_id` is `not null` with no default, and three of the four states
   * name a space on their own: a chosen list carries its own, and the
   * dashboard's `?space=` filter speaks for the rest. Only "all spaces" plus a
   * list-less tab has nothing to go on, and there the personal space answers —
   * the same fallback `resolveSpaceId` in lib/mcp/tasks.ts already uses, so the
   * assistant and the card put an unplaced task in the same drawer.
   *
   * Null while the spaces are still loading: the button waits rather than
   * guessing.
   */
  const destination = (): { spaceId: string; listId: string | null } | null => {
    if (tab.kind === 'list' && !isStale) {
      const list = lists.find((row) => row.id === tab.id)
      return list ? { spaceId: list.spaceId, listId: list.id } : null
    }
    if (spaceId) return { spaceId, listId: null }
    const personal = spaces.find((space) => space.isDefault)
    return personal ? { spaceId: personal.id, listId: null } : null
  }

  const target = destination()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!target || !draft.trim() || isSaving) return
    setIsSaving(true)
    const ok = await createTask({ ...target, title: draft })
    setIsSaving(false)
    // The field stays open and focused on success: tasks arrive in twos and
    // threes, and reopening it for each one is a click nobody asked for.
    if (ok) setDraft('')
  }

  const chip = (key: string, label: string, count: string, active: boolean, onClick: () => void) => (
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

  const row = (task: TaskCard, showWhere: boolean) => {
    const ticked = isTicked(task)
    return (
      <CollapsingRow key={task.id} leaving={Boolean(leaving[task.id])}>
        <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
          <TaskCheckbox
            title={task.title}
            checked={ticked}
            disabled={busyTaskId === task.id}
            onCheckedChange={() => void setDone(task, !ticked)}
          />
          <button
            type="button"
            onClick={() => setOpenTaskId(task.id)}
            className="min-w-0 flex-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-1.5">
              <PriorityDot priority={task.priority} dict={dict} />
              <span
                className={cn(
                  'truncate text-sm transition-colors',
                  ticked && 'text-muted-foreground line-through'
                )}
              >
                {task.title}
              </span>
            </span>
            {showWhere && (
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
        </div>
      </CollapsingRow>
    )
  }

  return (
    <DashboardCard>
      <CardHeader>
        <CardTitle>{dict.widget.title}</CardTitle>
        <CardDescription>{dict.widget.description}</CardDescription>
        {/* The way out belongs beside the title, not at the foot of the card:
            down there it was a third left edge competing with the rows and the
            toggle, and it read as another row rather than as a way out. */}
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={localeHref(locale, '/tasks')} />}
            className="-mr-2 text-muted-foreground"
          >
            {dict.widget.more}
            <ArrowRightIcon />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chip(
            'all',
            dict.widget.all,
            counted(openCount.length, isOpenCapped),
            tab.kind === 'all' || isStale,
            () => setTab({ kind: 'all' })
          )}
          {openCount.some((task) => task.listId === null) &&
            chip(
              'inbox',
              dict.inbox,
              counted(openCount.filter((task) => task.listId === null).length, isOpenCapped),
              tab.kind === 'inbox',
              () => setTab({ kind: 'inbox' })
            )}
          {lists.map((list) =>
            chip(
              list.id,
              listLabel(list.name, list.spaceId),
              // Counted from the rows this card holds rather than from the
              // view's `open_count`: a chip promises what is open right now,
              // and a server-side counter cannot move the instant something is
              // ticked off.
              counted(
                openCount.filter((task) => task.listId === list.id).length,
                isOpenCapped
              ),
              tab.kind === 'list' && tab.id === list.id && !isStale,
              () => setTab({ kind: 'list', id: list.id })
            )
          )}
        </div>

        {isLoading ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            {dict.loading}
          </p>
        ) : (
          <>
            {/* No "nothing here" line: the field below already says what an
                empty list means and what to do about it, and two sentences
                about the same absence read as clutter. Nothing is rendered at
                all rather than an empty <ul>, which would still take a gap from
                the surrounding space-y. */}
            {openRows.length > 0 && (
              <ul>
                {openShown.map((task) => row(task, tab.kind === 'all'))}
                {overflow(openRows.length - openShown.length, isOpenCapped)}
              </ul>
            )}

            {/* Closed underneath, new ones on top of it: this belongs to the
                open list, on the same left edge as the checkboxes above it. */}
            {isAdding ? (
              <form onSubmit={submit} className="flex items-center gap-1.5 px-2">
                <Input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setIsAdding(false)
                      setDraft('')
                    }
                  }}
                  placeholder={dict.taskPlaceholder}
                  aria-label={dict.addTask}
                  disabled={isSaving}
                  className="h-7"
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={dict.addTask}
                  disabled={isSaving || !draft.trim() || !target}
                >
                  <PlusIcon />
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                // Absent while the spaces are still loading: without one there
                // is nowhere to write, and a field that refuses on submit is
                // worse than one that waits a beat to appear.
                disabled={!target}
                onClick={() => setIsAdding(true)}
                className="w-full justify-start px-2 text-muted-foreground"
              >
                <PlusIcon />
                {dict.addTask}
              </Button>
            )}

            {/* Shown when there are rows underneath, counted by what is closed:
                a row on its way back out still has to be somewhere, and the
                number beside the label is about the tasks, not the markup.
                Absent rather than disabled when there is nothing at all — an
                affordance that opens onto nothing is a promise not kept. */}
            {doneRows.length > 0 && (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDone((shown) => !shown)}
                  // px-2 rather than the button's own padding: this has to start
                  // on the same vertical line as the checkboxes above it.
                  className="w-full justify-start px-2 text-muted-foreground"
                >
                  {showDone
                    ? dict.hideCompleted
                    : fill(dict.showCompleted, {
                        count: counted(doneCount.filter(inTab).length, isDoneCapped),
                      })}
                </Button>
                {showDone && (
                  <ul>
                    {doneRows.slice(0, VISIBLE).map((task) => row(task, tab.kind === 'all'))}
                    {overflow(doneRows.length - VISIBLE, isDoneCapped)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

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
