import { isAuthSessionMissingError } from '@supabase/supabase-js'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

import { safeNextPath } from '@/lib/safe-next-path'
import { createClient } from '@/lib/supabase/client'

export type OAuthConsentDecision = 'approve' | 'deny'

/**
 * Supabase OAuth has no custom scopes: the token always carries full access to
 * the user's data. What "read only" means is therefore decided by us, in
 * `public.oauth_grants`, and enforced by the restrictive policies that call
 * `private.mcp_can_write()`.
 */
export type OAuthAccessLevel = 'read_write' | 'read'

export interface UseOAuthConsentOptions {
  authorizationId?: string | null
  signInPath?: string
}

const withNextParam = (path: string, next: string) => {
  const url = new URL(path, window.location.origin)
  const searchParams = new URLSearchParams(url.search)
  searchParams.set('next', next)
  url.search = searchParams.toString()
  return `${url.pathname}${url.search}${url.hash}`
}

const useOAuthConsent = ({
  authorizationId,
  signInPath = '/auth/login',
}: UseOAuthConsentOptions) => {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [decision, setDecision] = useState<OAuthConsentDecision | null>(null)
  // Write is preselected: the product exists so that a budget can be kept from
  // an AI client, and a connection that silently cannot add an expense reads
  // as broken. The choice stays visible, and one click changes it — here, or
  // later on /settings/connections.
  const [access, setAccess] = useState<OAuthAccessLevel>('read_write')
  const isDeciding = useRef(false)

  useEffect(() => {
    let active = true

    const loadAuthorization = async () => {
      setIsLoading(true)
      setError(null)
      setDetails(null)
      setDecision(null)
      setAccess('read_write')

      if (!authorizationId) {
        setError('This page needs an authorization_id. Start again from your OAuth client.')
        setIsLoading(false)
        return
      }

      const supabase = createClient()
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError && !isAuthSessionMissingError(userError)) {
        if (active) {
          setError(userError.message)
          setIsLoading(false)
        }
        return
      }

      if (!user) {
        const next = `${window.location.pathname}${window.location.search}`
        if (active) {
          window.location.replace(withNextParam(safeNextPath(signInPath, '/auth/login'), next))
        }
        return
      }

      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (error) {
        if (active) {
          setError(error.message)
          setIsLoading(false)
        }
        return
      }

      if (!('authorization_id' in data)) {
        if (active) {
          window.location.replace(data.redirect_url)
        }
        return
      }

      if (active) {
        setDetails(data)
        setIsLoading(false)
      }
    }

    void loadAuthorization()
    return () => {
      active = false
    }
  }, [authorizationId, signInPath])

  const decide = useCallback(
    async (action: OAuthConsentDecision) => {
      if (!authorizationId || isDeciding.current) return

      isDeciding.current = true
      setDecision(action)
      setError(null)
      const supabase = createClient()

      // The grant is written before the token exists, so the client's very
      // first tool call already sees the right permissions. The other order
      // leaves a window in which the client holds a token and has no row.
      // A row without a token grants nothing — no token, no client_id to match
      // — and the connections page sweeps it away.
      if (action === 'approve' && details) {
        const { error: grantError } = await supabase.from('oauth_grants').upsert(
          {
            user_id: details.user.id,
            client_id: details.client.id,
            client_name: details.client.name,
            redirect_uri: details.redirect_uri,
            can_write: access === 'read_write',
          },
          { onConflict: 'user_id,client_id' }
        )

        if (grantError) {
          setError(grantError.message)
          setDecision(null)
          isDeciding.current = false
          return
        }
      }

      const result =
        action === 'approve'
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            })

      if (result.error) {
        setError(result.error.message)
        setDecision(null)
        isDeciding.current = false
        return
      }

      if (!result.data?.redirect_url) {
        setError('The server did not return a redirect. Start again from your OAuth client.')
        setDecision(null)
        isDeciding.current = false
        return
      }

      window.location.assign(result.data.redirect_url)
    },
    [access, authorizationId, details]
  )

  return {
    details,
    email: details?.user.email ?? null,
    error,
    isLoading,
    decision,
    access,
    setAccess,
    approve: () => decide('approve'),
    deny: () => decide('deny'),
  }
}

type UseOAuthConsentReturn = ReturnType<typeof useOAuthConsent>

export { useOAuthConsent, type OAuthAuthorizationDetails, type UseOAuthConsentReturn }
