'use client'

import Link from 'next/link'
import { useId, useState } from 'react'

import { useSpaces, type SpaceSummary } from '@/hooks/use-spaces'
import { useSpaceInvites, type SpaceInvite } from '@/hooks/use-space-invites'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { fill } from '@/lib/i18n/interpolate'
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

/**
 * Somebody wants you in their space. Everything on this card — the name, who
 * is asking, the head count — is the whole of what you may know before you
 * answer: until you accept you are not a member, so the space itself, its
 * transactions and its people stay invisible.
 *
 * The warning is not decoration. Accepting hands over a shared wallet, and the
 * one moment a person can weigh that is before the click, not after it.
 */
function InviteCard({
  invite,
  dict,
  error,
  isAccepting,
  isDeclining,
  onAccept,
  onDecline,
}: {
  invite: SpaceInvite
  dict: SpacesDictionary['invites']
  error: string | null
  isAccepting: boolean
  isDeclining: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const busy = isAccepting || isDeclining

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-words">{invite.spaceName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-medium">
            {invite.inviterAvatar ? (
              // Avatars come from whichever provider the inviter signed up
              // with, so they are not routed through next/image: no remote
              // pattern can be allowlisted ahead of an account that does not
              // exist yet.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={invite.inviterAvatar} alt="" className="size-full object-cover" />
            ) : (
              (invite.inviterName.trim().charAt(0).toUpperCase() || '?')
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {fill(dict.invitedBy, { name: invite.inviterName })} ·{' '}
            {fill(dict.members, { count: invite.memberCount })}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{dict.warning}</p>

        {/* In the card, not in a banner at the top: two invitations can fail
            for two different reasons, and only one of them is this one. */}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onDecline}>
            {isDeclining ? dict.declining : dict.decline}
          </Button>
          <Button type="button" disabled={busy} onClick={onAccept}>
            {isAccepting ? dict.accepting : dict.accept}
          </Button>
        </div>
      </CardContent>
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
  const { spaces, isLoading, isCreating, error, createSpace, reload } = useSpaces()

  const {
    invites,
    error: invitesError,
    busy,
    accept,
    decline,
  } = useSpaceInvites({
    notAllowed: dict.invites.errors.notAllowed,
    notFound: dict.invites.errors.notFound,
    expired: dict.invites.errors.expired,
    revoked: dict.invites.errors.revoked,
    spaceFull: dict.invites.errors.spaceFull,
    emailUnconfirmed: dict.invites.errors.emailUnconfirmed,
    unknown: dict.invites.errors.unknown,
  })

  // Keyed by invitation, because that is what a refusal is about. A card that
  // succeeds leaves the list, taking its entry with it.
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({})

  const handleAccept = async (id: string) => {
    const refusal = await accept(id)
    setInviteErrors((current) => ({ ...current, [id]: refusal ?? '' }))
    // The space is only in `my_spaces` from this moment: before accepting, the
    // view answered as if it did not exist.
    if (!refusal) reload()
  }

  const handleDecline = async (id: string) => {
    const refusal = await decline(id)
    setInviteErrors((current) => ({ ...current, [id]: refusal ?? '' }))
  }

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

      {invitesError && (
        <p role="alert" className="text-sm text-destructive">
          {dict.invites.error} {invitesError}
        </p>
      )}

      {/* No empty state and no heading when there is nothing: an invitation is
          an interruption, and a section that says "no invitations" is one
          every day for the sake of the day there is one. */}
      {invites.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {dict.invites.title}
          </h2>
          {invites.map((invite) => (
            <InviteCard
              key={invite.id}
              invite={invite}
              dict={dict.invites}
              error={inviteErrors[invite.id] || null}
              isAccepting={busy?.kind === 'accept' && busy.id === invite.id}
              isDeclining={busy?.kind === 'decline' && busy.id === invite.id}
              onAccept={() => void handleAccept(invite.id)}
              onDecline={() => void handleDecline(invite.id)}
            />
          ))}
        </section>
      )}

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
