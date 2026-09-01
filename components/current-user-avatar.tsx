'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user'

/**
 * The Supabase UI block `current-user-avatar-nextjs`, with two changes the
 * block's own docs invite: it reads the session through {@link useCurrentUser}
 * so it survives a sign-out without a reload, and the fallback falls back once
 * more, to the first letter of the address. Nobody signing up with an email
 * and a password has a `full_name`, and that is the only way in today, so the
 * block's plain "?" would be what every account got.
 */
export function CurrentUserAvatar() {
  const user = useCurrentUser()
  const initials = initialsOf(user)

  return (
    <Avatar>
      {user?.image && <AvatarImage src={user.image} alt={initials} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}

function initialsOf(user: CurrentUser | null): string {
  const fromName = user?.name
    ?.split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return fromName || user?.email?.[0]?.toUpperCase() || '?'
}
