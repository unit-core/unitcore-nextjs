'use client'

import { useId } from 'react'

import { cn } from '@/lib/utils'
import { useLocale } from '@/lib/i18n/use-locale'
import { localeHref } from '@/lib/i18n/urls'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import {
  useOAuthConsent,
  type OAuthAccessLevel,
  type OAuthConsentDecision,
} from '@/hooks/use-oauth-consent'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export type ConsentAccessDictionary = Dictionary['consent']['access']

const getInitial = (value: string) => value.trim().charAt(0).toUpperCase() || '?'

interface ConsentCardShellProps extends React.ComponentPropsWithoutRef<'div'> {
  clientName: string
  productName: string
}

function ConsentCardShell({
  clientName,
  productName,
  className,
  children,
  ...props
}: ConsentCardShellProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="items-center space-y-4 text-center">
          <div
            className="flex items-center justify-center"
            aria-label={`${clientName} connecting to ${productName}`}
          >
            <div className="flex size-12 items-center justify-center rounded-full border bg-muted font-medium">
              {getInitial(clientName)}
            </div>
            <div className="h-px w-8 bg-border" aria-hidden="true" />
            <div className="flex size-12 items-center justify-center rounded-full border bg-muted font-medium">
              {getInitial(productName)}
            </div>
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Authorize {clientName}</CardTitle>
            <CardDescription>Review what this client gets access to.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>
    </div>
  )
}

interface AccessChoiceProps {
  dict: ConsentAccessDictionary
  value: OAuthAccessLevel
  onChange: (value: OAuthAccessLevel) => void
  disabled?: boolean
}

/**
 * Supabase OAuth has no custom scopes, so this is not something the client
 * asked for and the user confirms — it is the user's own decision, and the
 * only place the product lets them make it before the token exists.
 */
function AccessChoice({ dict, value, onChange, disabled }: AccessChoiceProps) {
  const id = useId()
  const options = [
    { value: 'read_write' as const, label: dict.readWrite, hint: dict.readWriteHint },
    { value: 'read' as const, label: dict.readOnly, hint: dict.readOnlyHint },
  ]

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">{dict.title}</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as OAuthAccessLevel)}
        disabled={disabled}
        className="gap-0 divide-y rounded-lg border"
      >
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className="flex cursor-pointer items-start gap-3 p-4 text-sm has-data-disabled:cursor-not-allowed"
          >
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
            <span className="space-y-1">
              <span className="block font-medium">{option.label}</span>
              <span className="block text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

export interface OAuthConsentCardProps extends React.ComponentPropsWithoutRef<'div'> {
  clientName: string
  productName?: string
  redirectUri: string
  email: string
  scopes?: string[]
  accessDict: ConsentAccessDictionary
  access: OAuthAccessLevel
  onAccessChange: (value: OAuthAccessLevel) => void
  error?: string | null
  decision?: OAuthConsentDecision | null
  onApprove?: () => void
  onDeny?: () => void
}

export function OAuthConsentCard({
  clientName,
  productName = 'Your product',
  redirectUri,
  email,
  scopes = [],
  accessDict,
  access,
  onAccessChange,
  error = null,
  decision = null,
  onApprove,
  onDeny,
  ...props
}: OAuthConsentCardProps) {
  return (
    <ConsentCardShell clientName={clientName} productName={productName} {...props}>
      <dl className="divide-y rounded-lg border text-sm">
        <div className="flex items-center justify-between gap-6 p-4">
          <dt className="text-muted-foreground">Client</dt>
          <dd className="min-w-0 break-all text-right font-medium">{clientName}</dd>
        </div>
        <div className="flex items-center justify-between gap-6 p-4">
          <dt className="text-muted-foreground">Redirects to</dt>
          <dd className="min-w-0 break-all text-right font-medium">{redirectUri}</dd>
        </div>
        <div className="flex items-center justify-between gap-6 p-4">
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd className="min-w-0 break-all text-right font-medium">{email}</dd>
        </div>
        {scopes.length > 0 && (
          <div className="flex items-center justify-between gap-6 p-4">
            <dt className="text-muted-foreground">Scopes</dt>
            <dd className="min-w-0 break-all text-right font-medium">{scopes.join(', ')}</dd>
          </div>
        )}
      </dl>
      <AccessChoice
        dict={accessDict}
        value={access}
        onChange={onAccessChange}
        disabled={decision !== null}
      />
      <p className="text-sm text-muted-foreground">
        Allow access only if you recognize this application. It can act on your behalf only within
        the requested permissions and the access you already have.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={decision !== null} onClick={onDeny}>
          {decision === 'deny' ? 'Denying...' : 'Deny'}
        </Button>
        <Button type="button" disabled={decision !== null} onClick={onApprove}>
          {decision === 'approve' ? 'Allowing...' : 'Allow access'}
        </Button>
      </div>
    </ConsentCardShell>
  )
}

interface OAuthConsentProps extends React.ComponentPropsWithoutRef<'div'> {
  authorizationId?: string | null
  signInPath?: string
  productName?: string
  accessDict: ConsentAccessDictionary
}

export function OAuthConsent({
  authorizationId,
  signInPath,
  productName = 'Your product',
  accessDict,
  ...props
}: OAuthConsentProps) {
  const locale = useLocale()
  const { details, email, error, isLoading, decision, access, setAccess, approve, deny } =
    useOAuthConsent({
      authorizationId,
      // Every page lives under a locale, so an unauthenticated visitor must be
      // sent to the login form in the language they are already reading.
      signInPath: signInPath ?? localeHref(locale, '/auth/login'),
    })

  if (isLoading || !details || !email) {
    return (
      <ConsentCardShell clientName="OAuth client" productName={productName} {...props}>
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading authorization request...
          </p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {error ??
              'Unable to load the authorization request. Start again from your OAuth client.'}
          </p>
        )}
      </ConsentCardShell>
    )
  }

  return (
    <OAuthConsentCard
      clientName={details.client.name}
      productName={productName}
      redirectUri={details.redirect_uri}
      email={email}
      scopes={details.scope.split(' ').filter(Boolean)}
      accessDict={accessDict}
      access={access}
      onAccessChange={setAccess}
      error={error}
      decision={decision}
      onApprove={() => void approve()}
      onDeny={() => void deny()}
      {...props}
    />
  )
}
