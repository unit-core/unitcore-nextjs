'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSpaces } from '@/hooks/use-spaces'
import { type Dictionary } from '@/lib/i18n/dictionaries'

/**
 * Narrows the dashboard to one space, or back to all of them.
 *
 * The choice lives in the query string rather than a cookie: the page is a
 * Server Component that re-reads its data per request, so `?space=` is enough to
 * make the view linkable and to survive a reload without inventing a
 * preferences store the project does not have yet.
 *
 * Nothing here decides what is visible — dropping the filter shows every space
 * the reader is a member of because RLS says so, not because this list does.
 */
export function SpaceFilter({ dict }: { dict: Dictionary['dashboard'] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const selected = params.get('space')
  const { spaces, isLoading } = useSpaces()

  const select = (spaceId: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (spaceId) next.set('space', spaceId)
    else next.delete('space')
    // The pathname is written out rather than pushing a bare `?`, which would
    // leave a dangling question mark in the address bar once the filter clears.
    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const current = spaces.find((space) => space.id === selected)
  // Three states, not two. While the list is still loading there is no name to
  // show, so the trigger waits rather than flashing the wrong label; and a
  // `?space=` naming something this reader cannot see — a hand-edited URL, or a
  // space they have since left — settles back on the neutral label instead of
  // waiting for a name that will never arrive.
  const label = !selected || (!isLoading && !current) ? dict.allSpaces : (current?.name ?? '…')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={isLoading && spaces.length === 0}>
            {label}
            <ChevronDown className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => select(null)}>
          {dict.allSpaces}
          {selected === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {spaces.map((space) => (
          <DropdownMenuItem key={space.id} onClick={() => select(space.id)}>
            <span className="truncate">{space.name}</span>
            {selected === space.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
