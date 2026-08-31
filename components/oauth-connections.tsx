'use client'

import Link from 'next/link'
import { useId } from 'react'

import { useOAuthGrants, type OAuthConnection } from '@/hooks/use-oauth-grants'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ConnectionsDictionary = Dictionary['settings']['connections']

const getInitial = (value: string) => value.trim().charAt(0).toUpperCase() || '?'

interface ConnectionCardProps {
  connection: OAuthConnection
  dict: ConnectionsDictionary
  locale: string
  isRevoking: boolean
  onWriteChange: (canWrite: boolean) => void
  onRevoke: () => void
}

function ConnectionCard({
  connection,
  dict,
  locale,
  isRevoking,
  onWriteChange,
  onRevoke,
}: ConnectionCardProps) {
  const switchId = useId()

  return (
    <Card>
      <CardHeader className="grid-cols-[auto_1fr] gap-3">
        <div className="row-span-2 flex size-10 items-center justify-center overflow-hidden rounded-full border bg-muted font-medium">
          {connection.logoUri ? (
            // Client logos come from arbitrary registered origins, so they are
            // not routed through next/image: no remote pattern can be
            // allowlisted ahead of a client that registers itself.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={connection.logoUri} alt="" className="size-full object-cover" />
          ) : (
            getInitial(connection.clientName)
          )}
        </div>
        <CardTitle className="text-base break-all">{connection.clientName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {dict.connectedOn}{' '}
          {new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
            new Date(connection.grantedAt)
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection.redirectUri && (
          <p className="text-sm text-muted-foreground">
            {dict.redirectsTo}{' '}
            <span className="font-mono break-all text-foreground">{connection.redirectUri}</span>
          </p>
        )}

        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <label htmlFor={switchId} className="block text-sm font-medium">
              {dict.write}
            </label>
            <p className="text-sm text-muted-foreground">
              {!connection.hasGrant
                ? dict.noGrant
                : connection.canWrite
                  ? dict.writeHint
                  : dict.readOnly}
            </p>
          </div>
          <Switch
            id={switchId}
            checked={connection.canWrite}
            onCheckedChange={onWriteChange}
            aria-label={dict.write}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{dict.revokeHint}</p>
          <Button
            type="button"
            variant="outline"
            disabled={isRevoking}
            onClick={onRevoke}
            className="shrink-0 text-destructive hover:text-destructive"
          >
            {isRevoking ? dict.revoking : dict.revoke}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface OAuthConnectionsProps extends React.ComponentPropsWithoutRef<'div'> {
  dict: ConnectionsDictionary
}

export function OAuthConnections({ dict, className, ...props }: OAuthConnectionsProps) {
  const locale = useLocale()
  const { connections, isLoading, error, revokingClientId, setCanWrite, revoke } = useOAuthGrants()

  return (
    <div className={cn('space-y-4', className)} {...props}>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {dict.error} {error}
        </p>
      )}

      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {dict.loading}
        </p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.empty}{' '}
          <Link href={localeHref(locale, '/blog')} className="underline underline-offset-4">
            {dict.emptyCta}
          </Link>
        </p>
      ) : (
        // Not deduplicated by name on purpose: eight "Claude" cards are eight
        // separate DCR registrations, each with its own client_id, its own
        // permissions and its own revoke. Collapsing them would hide which one
        // the user is actually revoking — the connection date tells them apart.
        connections.map((connection) => (
          <ConnectionCard
            key={connection.clientId}
            connection={connection}
            dict={dict}
            locale={locale}
            isRevoking={revokingClientId === connection.clientId}
            onWriteChange={(canWrite) => void setCanWrite(connection.clientId, canWrite)}
            onRevoke={() => void revoke(connection.clientId)}
          />
        ))
      )}
    </div>
  )
}
