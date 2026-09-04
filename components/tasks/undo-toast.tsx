'use client'

import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'

/**
 * The five seconds between "Delete" and meaning it.
 *
 * Deleting a task is soft, so this is a convenience rather than the only way
 * back — whatever it dismisses is still in the trash. That is exactly why it
 * may disappear on a timer without asking.
 */
export function UndoToast({
  message,
  action,
  onAction,
  onDismiss,
}: {
  message: string
  action: string
  onAction: () => void
  onDismiss: () => void
}) {
  // Through a ref so the five seconds are five seconds: the caller passes a
  // fresh closure on every render, and depending on it directly would restart
  // the countdown each time anything above re-rendered. The caller keys this
  // component on what was deleted, so a second deletion remounts it and starts
  // a new timer, which is the only restart that should happen.
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), 5000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-xl bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
    >
      <span>{message}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onAction}>
        {action}
      </Button>
    </div>
  )
}
