'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'

import { TransactionDialog } from '@/components/dashboard/transaction-dialog'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

/**
 * The way to write a transaction by hand, wherever the dashboard offers it: the
 * empty state, where it is the only thing to do, and the header of each currency
 * card once the empty state is gone.
 */
export function AddTransaction({
  dict,
  spaceId,
  currency,
  variant = 'default',
  className,
}: {
  dict: Dictionary['dashboard']
  /** The dashboard's `?space=` filter, when it is set. Then there is nothing to choose. */
  spaceId?: string
  /** The card this sits on, so its currency is already filled in. */
  currency?: string
  variant?: 'default' | 'ghost'
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={variant === 'ghost' ? 'sm' : 'default'}
        onClick={() => setOpen(true)}
        className={cn(variant === 'ghost' && '-mr-2 text-muted-foreground', className)}
      >
        <PlusIcon />
        {dict.form.action}
      </Button>

      <TransactionDialog
        dict={dict}
        open={open}
        onOpenChange={setOpen}
        spaceId={spaceId}
        currency={currency}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
