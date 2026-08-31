'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { useSpace, type SpaceMember } from '@/hooks/use-space'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SpacesDictionary = Dictionary['settings']['spaces']

const getInitial = (value: string) => value.trim().charAt(0).toUpperCase() || '?'

function MemberRow({
  member,
  dict,
  canRemove,
  isRemoving,
  onRemove,
}: {
  member: SpaceMember
  dict: SpacesDictionary['detail']['members']
  canRemove: boolean
  isRemoving: boolean
  onRemove: () => void
}) {
  const name = member.fullName?.trim()

  return (
    <li className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-medium">
        {member.avatarUrl ? (
          // Avatars come from whichever provider the member signed up with, so
          // they are not routed through next/image: no remote pattern can be
          // allowlisted ahead of an account that does not exist yet.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          // "?" rather than the first letter of the placeholder: an initial
          // taken from "Unnamed" looks like a name nobody has.
          getInitial(name ?? '')
        )}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        <span className={name ? 'text-sm' : 'text-sm text-muted-foreground'}>
          {name ?? dict.unnamed}
        </span>
        {member.isOwner && (
          <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
            {dict.owner}
          </span>
        )}
        {member.isMe && (
          <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
            {dict.you}
          </span>
        )}
      </div>

      {/* The owner has no remove button: the trigger that keeps them inside
          their own space would refuse it anyway. */}
      {canRemove && !member.isOwner && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isRemoving}
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          {isRemoving ? dict.removing : dict.remove}
        </Button>
      )}
    </li>
  )
}

export function SpaceDetail({ spaceId, dict }: { spaceId: string; dict: SpacesDictionary }) {
  const locale = useLocale()
  const router = useRouter()
  const nameId = useId()
  const emailId = useId()
  const confirmId = useId()

  const { space, members, isLoading, error, busy, rename, remove, addMember, removeMember, leave } =
    useSpace(spaceId, {
      notAllowed: dict.detail.errors.notAllowed,
      silent: dict.detail.errors.silent,
      inviteNotFound: dict.detail.invite.notFound,
      inviteAlready: dict.detail.invite.already,
    })

  const [draftName, setDraftName] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  // Null means "follow the server". The field shows the name the space came
  // back with until something is typed into it, and returns to following after
  // a successful rename — so a rename made elsewhere is never overwritten by a
  // stale draft sitting in this input.
  const name = draftName ?? space?.name ?? ''

  const spacesHref = localeHref(locale, '/settings/spaces')

  const backLink = (
    <Link
      href={spacesHref}
      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      ← {dict.detail.back}
    </Link>
  )

  if (isLoading) {
    return (
      <div className="mt-8 space-y-6">
        {backLink}
        <p role="status" className="text-sm text-muted-foreground">
          {dict.loading}
        </p>
      </div>
    )
  }

  if (!space) {
    return (
      <div className="mt-8 space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">{dict.detail.notFound}</p>
      </div>
    )
  }

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || name.trim() === space.name) return
    if (await rename(name)) setDraftName(null)
  }

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return
    if (await addMember(email)) setEmail('')
  }

  const handleLeave = async () => {
    if (await leave()) {
      setIsLeaveOpen(false)
      router.push(spacesHref)
      return
    }
    setIsLeaveOpen(false)
  }

  const handleDelete = async () => {
    if (await remove()) {
      setIsDeleteOpen(false)
      router.push(spacesHref)
      return
    }
    setIsDeleteOpen(false)
  }

  return (
    <div className="mt-8 space-y-6">
      {backLink}

      <header className="space-y-2">
        <h1 className="text-2xl font-medium break-words">{space.name}</h1>
        <p className="text-muted-foreground">
          {/* is_default marks the owner's personal space, so it only means
              "Personal" when the owner is the reader. */}
          {space.isMine ? (space.isDefault ? dict.personal : dict.owner) : dict.guest}
        </p>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {space.isMine && (
        <Card>
          <CardContent>
            <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={nameId}>{dict.detail.rename.label}</Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(event) => setDraftName(event.target.value)}
                  disabled={busy?.kind === 'rename'}
                />
              </div>
              <Button
                type="submit"
                disabled={busy?.kind === 'rename' || !name.trim() || name.trim() === space.name}
              >
                {busy?.kind === 'rename' ? dict.detail.rename.submitting : dict.detail.rename.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{dict.detail.members.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                dict={dict.detail.members}
                canRemove={space.isMine}
                isRemoving={busy?.kind === 'removeMember' && busy.userId === member.userId}
                onRemove={() => void removeMember(member.userId)}
              />
            ))}
          </ul>

          {space.isMine && (
            <form onSubmit={handleInvite} className="space-y-1.5 border-t pt-4">
              <Label htmlFor={emailId}>{dict.detail.invite.label}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={dict.detail.invite.placeholder}
                  disabled={busy?.kind === 'invite'}
                />
                <Button type="submit" disabled={busy?.kind === 'invite' || !email.trim()}>
                  {busy?.kind === 'invite'
                    ? dict.detail.invite.submitting
                    : dict.detail.invite.submit}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{dict.detail.invite.hint}</p>
            </form>
          )}
        </CardContent>
      </Card>

      {!space.isMine && (
        <Card>
          <CardHeader>
            <CardTitle>{dict.detail.leave.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{dict.detail.leave.hint}</p>
            <Button
              type="button"
              variant="outline"
              disabled={busy?.kind === 'leave'}
              onClick={() => setIsLeaveOpen(true)}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              {busy?.kind === 'leave' ? dict.detail.leave.submitting : dict.detail.leave.submit}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* The personal space has no delete button rather than a disabled one:
          the trigger makes it undeletable for good, so offering the action and
          refusing it would be a promise the database never intends to keep. */}
      {space.isMine && !space.isDefault && (
        <Card>
          <CardHeader>
            <CardTitle>{dict.detail.remove.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{dict.detail.remove.hint}</p>
            <Button
              type="button"
              variant="destructive"
              disabled={busy?.kind === 'remove'}
              onClick={() => {
                setConfirmName('')
                setIsDeleteOpen(true)
              }}
              className="shrink-0"
            >
              {dict.detail.remove.submit}
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.detail.leave.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.detail.leave.dialogBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.detail.cancel}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy?.kind === 'leave'}
              onClick={() => void handleLeave()}
            >
              {busy?.kind === 'leave' ? dict.detail.leave.submitting : dict.detail.leave.submit}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.detail.remove.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dict.detail.remove.dialogBody}</AlertDialogDescription>
          </AlertDialogHeader>

          {/* Typing the name is the confirmation. It is checked against the
              name the server just returned, so a rename in another tab makes
              this dialog refuse rather than delete the wrong space. */}
          <div className="space-y-1.5">
            <Label htmlFor={confirmId}>{dict.detail.remove.confirmLabel}</Label>
            <Input
              id={confirmId}
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={space.name}
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{dict.detail.cancel}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy?.kind === 'remove' || confirmName.trim() !== space.name}
              onClick={() => void handleDelete()}
            >
              {busy?.kind === 'remove' ? dict.detail.remove.deleting : dict.detail.remove.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
