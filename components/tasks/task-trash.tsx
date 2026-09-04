'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'

import { type TasksDictionary } from '@/components/tasks/task-meta'
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
import { type TrashEntry } from '@/hooks/use-task-board'
import { fill } from '@/lib/i18n/interpolate'

/**
 * What soft deletion is for: a list of tasks that are gone from every view but
 * still in the table, and one button that brings each of them back.
 *
 * Restoring a parent brings back exactly what went down with it, which is why a
 * subtask deleted alongside its parent is not listed separately — the hook
 * filters those out, so nothing here offers to restore half a task.
 */
export function TaskTrash({
  entries,
  dict,
  isEmptying,
  onOpen,
  onRestore,
  onEmpty,
}: {
  entries: TrashEntry[] | null
  dict: TasksDictionary
  isEmptying: boolean
  onOpen: () => void
  onRestore: (id: string) => void
  onEmpty: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  // Through a ref because the caller passes a fresh closure every render, and
  // depending on it directly would refetch on every render of the board.
  const request = useRef(onOpen)
  useEffect(() => {
    request.current = onOpen
  })

  /**
   * Null means "nothing loaded", and it arrives two ways: nobody has opened the
   * bin yet, and something has just invalidated what was in it — restoring a
   * task, emptying it, deleting another one. Asking for it whenever it is both
   * open and unloaded covers both, so a restore does not leave the panel
   * sitting on "loading" until it is collapsed and opened again.
   */
  useEffect(() => {
    if (isOpen && entries === null) request.current()
  }, [isOpen, entries])

  return (
    <section className="rounded-[min(var(--radius-4xl),20px)] bg-card p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // Paid for on the first expand, not on every board load: most visits
        // never look in the bin. The effect above does the asking.
        onClick={() => setIsOpen((open) => !open)}
        className="w-full justify-start text-muted-foreground"
      >
        {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {entries === null ? dict.trashTitle : fill(dict.trash, { count: entries.length })}
      </Button>

      {isOpen && (
        <div className="mt-2 space-y-2">
          {entries === null ? (
            <p className="px-2 text-xs text-muted-foreground">{dict.loading}</p>
          ) : entries.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">{dict.trashEmpty}</p>
          ) : (
            <>
              <ul className="space-y-1">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 px-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">
                      {entry.title}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onRestore(entry.id)}
                    >
                      {dict.restore}
                    </Button>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isEmptying}
                onClick={() => setIsConfirming(true)}
                className="text-destructive hover:text-destructive"
              >
                {dict.emptyTrash}
              </Button>
            </>
          )}
        </div>
      )}

      {/* The one irreversible button in the product, so it asks first. */}
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.emptyTrashTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.emptyTrashBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.cancel}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isEmptying}
              onClick={() => {
                setIsConfirming(false)
                onEmpty()
              }}
            >
              {dict.emptyTrash}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
