'use client'

import Link from 'next/link'
import { useId, useState } from 'react'

import { useSpaces, type SpaceSummary } from '@/hooks/use-spaces'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SpacesDictionary = Dictionary['settings']['spaces']

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

function SpaceCard({
  space,
  dict,
  locale,
}: {
  space: SpaceSummary
  dict: SpacesDictionary
  locale: Locale
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-3">
        <div className="space-y-1">
          <CardTitle className="break-words">{space.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Only your own: is_default belongs to the owner, and calling
                someone else's personal space "Personal" reads as if it were
                yours. */}
            {space.isDefault && space.isMine && <Badge>{dict.personal}</Badge>}
            <Badge>{space.isMine ? dict.owner : dict.guest}</Badge>
            <span className="text-sm text-muted-foreground">
              {dict.members}: {space.memberCount}
            </span>
          </div>
        </div>
        {/* A styled link rather than a Button rendering one: this navigates,
            and Base UI's Button would announce it to a screen reader as a
            button either way it is configured. */}
        <Link
          href={localeHref(locale, `/settings/spaces/${space.id}`)}
          className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}
        >
          {dict.open}
        </Link>
      </CardHeader>
    </Card>
  )
}

interface SpacesListProps extends React.ComponentPropsWithoutRef<'div'> {
  dict: SpacesDictionary
}

export function SpacesList({ dict, className, ...props }: SpacesListProps) {
  const locale = useLocale()
  const nameId = useId()
  const [name, setName] = useState('')
  const { spaces, isLoading, isCreating, error, createSpace } = useSpaces()

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    if (await createSpace(name)) setName('')
  }

  return (
    <div className={cn('space-y-6', className)} {...props}>
      <Card>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={nameId}>{dict.create.label}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={dict.create.placeholder}
                disabled={isCreating}
              />
            </div>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? dict.create.submitting : dict.create.submit}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {dict.error} {error}
        </p>
      )}

      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {dict.loading}
        </p>
      ) : (
        // No empty state: a trigger creates the personal space on sign-up and
        // another one keeps it from being deleted, so this list always has at
        // least one card in it.
        <div className="space-y-4">
          {spaces.map((space) => (
            <SpaceCard key={space.id} space={space} dict={dict} locale={locale} />
          ))}
        </div>
      )}
    </div>
  )
}
