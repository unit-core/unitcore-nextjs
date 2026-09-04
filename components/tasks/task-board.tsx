'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { TaskColumn } from '@/components/tasks/task-column'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { type TasksDictionary } from '@/components/tasks/task-meta'
import { TaskTrash } from '@/components/tasks/task-trash'
import { UndoToast } from '@/components/tasks/undo-toast'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTaskBoard } from '@/hooks/use-task-board'
import { plural } from '@/lib/i18n/interpolate'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { POSITION_STEP, needsRenumber, positionBetween } from '@/lib/tasks/format'
import { type TaskCard, type TaskList } from '@/lib/tasks/model'
import { taskMessages } from '@/lib/tasks/messages'

/**
 * One space's board: Inbox, every list beside it, and the trash underneath.
 *
 * The columns are the lists plus one that is not a list at all. "Inbox" is
 * `list_id is null` and a word in the dictionary — there is deliberately no row
 * behind it, so it cannot be renamed, archived or deleted, and a task that
 * loses its list lands there by doing nothing.
 */
export function TaskBoard({ spaceId, dict }: { spaceId: string; dict: TasksDictionary }) {
  const locale = useLocale()
  const messages = taskMessages(dict)
  const board = useTaskBoard(spaceId, messages)

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [dragTask, setDragTask] = useState<TaskCard | null>(null)
  const [listToDelete, setListToDelete] = useState<TaskList | null>(null)
  const [newListName, setNewListName] = useState('')
  const [isAddingList, setIsAddingList] = useState(false)
  const [undoTaskId, setUndoTaskId] = useState<string | null>(null)

  const backLink = (
    <Link
      href={localeHref(locale, '/tasks')}
      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      ← {dict.title}
    </Link>
  )

  if (board.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p role="status" className="text-sm text-muted-foreground">
          {dict.loading}
        </p>
      </div>
    )
  }

  if (!board.space) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">{dict.notFound}</p>
      </div>
    )
  }

  const columnOf = (listId: string | null) =>
    board.openTasks
      .filter((task) => task.listId === listId)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))

  const doneOf = (listId: string | null) => board.doneTasks.filter((task) => task.listId === listId)

  /**
   * Where a dragged card lands. Positions are fractional, so the average of two
   * neighbours is a free insertion — nobody else moves, and one `UPDATE` does
   * the list and the place at once.
   *
   * Once the fraction has degraded past what `numeric` should carry, the column
   * is renumbered instead and this drag is spent on that: the positions it was
   * computed from no longer exist. It takes on the order of a thousand
   * insertions between the same two rows to get there.
   */
  const drop = async (listId: string | null, before: TaskCard | null) => {
    const task = dragTask
    setDragTask(null)
    if (!task) return

    const column = columnOf(listId).filter((row) => row.id !== task.id)
    if (needsRenumber(column.map((row) => row.positionRaw))) {
      await board.renumber(listId)
      return
    }

    const index = before ? column.findIndex((row) => row.id === before.id) : column.length
    const at = index < 0 ? column.length : index
    const position = column.length
      ? positionBetween(column[at - 1]?.position, column[at]?.position)
      : POSITION_STEP

    if (task.listId === listId && task.position === position) return
    await board.moveTask(task.id, listId, position)
  }

  const addList = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newListName.trim()) return
    // A name that already exists is not an error worth stopping on: the hook
    // hands back the list that has it, and the board simply shows that column.
    const id = await board.createList(newListName)
    if (id) {
      setNewListName('')
      setIsAddingList(false)
    }
  }

  const confirmDeleteList = async () => {
    if (!listToDelete) return
    const target = listToDelete
    setListToDelete(null)
    await board.deleteList(target.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          {backLink}
          <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">
            {board.space.name}
          </h1>
        </div>

        {isAddingList ? (
          <form onSubmit={addList} className="flex items-center gap-2">
            <Input
              autoFocus
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder={dict.list.namePlaceholder}
              aria-label={dict.addList}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsAddingList(false)
              }}
              className="w-56"
            />
            <Button type="submit" size="sm" disabled={board.busy?.kind === 'createList'}>
              {dict.addList}
            </Button>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingList(true)}>
            <PlusIcon />
            {dict.addList}
          </Button>
        )}
      </div>

      {board.error && (
        <p role="alert" className="text-sm text-destructive">
          {board.error}
        </p>
      )}

      {/* A board scrolls sideways; the page never does. */}
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {[null, ...board.lists].map((list) => {
          const listId = list?.id ?? null
          return (
            <div key={listId ?? 'inbox'} className="w-72 shrink-0">
              <TaskColumn
                list={list}
                openTasks={columnOf(listId)}
                doneTasks={doneOf(listId)}
                locale={locale}
                dict={dict}
                busyTaskId={board.busy?.kind === 'task' ? board.busy.taskId : null}
                isCreating={
                  board.busy?.kind === 'createTask' && board.busy.listId === listId
                }
                isListBusy={board.busy?.kind === 'list' && board.busy.listId === listId}
                dragTaskId={dragTask?.id ?? null}
                onCreateTask={(title) => board.createTask({ listId, title })}
                onToggle={(task, done) => void board.setTaskDone(task, done)}
                onOpen={(task) => setOpenTaskId(task.id)}
                onDragStart={setDragTask}
                onDragEnd={() => setDragTask(null)}
                onDropBefore={(task) => void drop(listId, task)}
                onDropAtEnd={() => void drop(listId, null)}
                onRename={(name) => list && void board.updateList(list.id, { name })}
                onRecolor={(color) => list && void board.updateList(list.id, { color })}
                onArchive={() =>
                  list &&
                  void board.updateList(list.id, { archived_at: new Date().toISOString() })
                }
                onRequestDelete={() => list && setListToDelete(list)}
              />
            </div>
          )
        })}
      </div>

      {/* Archiving would be a one-way door without this. */}
      {board.archivedLists.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{dict.list.archived}</h2>
          <ul className="flex flex-wrap gap-2">
            {board.archivedLists.map((list) => (
              <li key={list.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={board.busy?.kind === 'list' && board.busy.listId === list.id}
                  onClick={() => void board.updateList(list.id, { archived_at: null })}
                >
                  <span className="truncate">{list.name}</span>
                  <span className="text-muted-foreground">· {dict.list.unarchive}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TaskTrash
        entries={board.trash}
        dict={dict}
        isEmptying={board.busy?.kind === 'emptyTrash'}
        onOpen={() => void board.loadTrash()}
        onRestore={(id) => void board.restoreTask(id)}
        onEmpty={() => void board.emptyTrash()}
      />

      <TaskDialog
        taskId={openTaskId}
        locale={locale}
        dict={dict}
        messages={messages}
        onClose={() => setOpenTaskId(null)}
        onChanged={board.reload}
        onDeleted={setUndoTaskId}
      />

      {/*
       * Deleting a list is the one action in this product that surprises
       * people: its tasks are not deleted with it, they come back under Inbox.
       * Saying so, with the number, is the difference between a warning and a
       * confirmation nobody reads.
       */}
      <AlertDialog
        open={listToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setListToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.list.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Through `plural`, not `fill`: this sentence names a number and
                  then agrees with it, and "1 задач переедут" would undo the
                  point of showing the number at all. */}
              {plural(locale, dict.list.deleteWarning, listToDelete?.totalCount ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.cancel}</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void confirmDeleteList()}>
              {dict.list.delete}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {undoTaskId && (
        <UndoToast
          key={undoTaskId}
          message={dict.deleteUndo}
          action={dict.undo}
          onAction={() => {
            const id = undoTaskId
            setUndoTaskId(null)
            void board.restoreTask(id)
          }}
          onDismiss={() => setUndoTaskId(null)}
        />
      )}
    </div>
  )
}
