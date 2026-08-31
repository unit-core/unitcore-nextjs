'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * One connected application, assembled from the two sources that each know
 * half of the story:
 *
 * - `auth.oauth.listGrants()` is the truth about what is connected. It returns
 *   the client id, name and logo, and when the grant was made — but no
 *   redirect URI.
 * - `public.oauth_grants` is our own decision about what that client may do.
 *   It also carries the redirect URI we snapshotted at consent time, which is
 *   the only way to show one: the `auth` schema is not exposed to PostgREST,
 *   and a security definer function returning rows is forbidden by
 *   `supabase/checks/security-invariants.sql`.
 */
export interface OAuthConnection {
  clientId: string
  clientName: string
  logoUri: string | null
  grantedAt: string
  /** Null for a grant made before permissions became per-user. */
  redirectUri: string | null
  canWrite: boolean
  /** False when the grant predates our row, or consent was interrupted. */
  hasGrant: boolean
}

interface GrantRow {
  client_id: string
  client_name: string
  redirect_uri: string
  can_write: boolean
}

export const useOAuthGrants = () => {
  const [connections, setConnections] = useState<OAuthConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null)
  // Bumped to re-read both sources. A counter rather than an exported reload
  // function: the load has to live inside the effect so that an unmounted page
  // stops setting state halfway through.
  const [reloadToken, setReloadToken] = useState(0)
  const userId = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      const supabase = createClient()

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) {
        if (active) {
          setError(userError?.message ?? 'You are not signed in.')
          setIsLoading(false)
        }
        return
      }
      userId.current = user.id

      const { data: grants, error: grantsError } = await supabase.auth.oauth.listGrants()
      if (grantsError) {
        if (active) {
          setError(grantsError.message)
          setIsLoading(false)
        }
        return
      }

      const { data: rows, error: rowsError } = await supabase
        .from('oauth_grants')
        .select('client_id, client_name, redirect_uri, can_write')
        .returns<GrantRow[]>()
      if (rowsError) {
        if (active) {
          setError(rowsError.message)
          setIsLoading(false)
        }
        return
      }

      const live = new Set(grants.map((grant) => grant.client.id))
      const orphans = rows.filter((row) => !live.has(row.client_id))

      // Rows left behind by a consent that never completed, or by a revoke
      // whose second step failed. They grant nothing — no token carries their
      // client_id — so the sweep is silent: there is nothing for the user to do
      // about it. Only forward: a grant without a row of ours is left alone and
      // shows as "permissions not set".
      if (orphans.length > 0) {
        await supabase
          .from('oauth_grants')
          .delete()
          .in(
            'client_id',
            orphans.map((row) => row.client_id)
          )
      }

      const byClientId = new Map(rows.map((row) => [row.client_id, row]))

      if (!active) return

      setConnections(
        grants
          .map((grant) => {
            const row = byClientId.get(grant.client.id)
            return {
              clientId: grant.client.id,
              clientName: grant.client.name,
              logoUri: grant.client.logo_uri || null,
              grantedAt: grant.granted_at,
              redirectUri: row?.redirect_uri || null,
              canWrite: row?.can_write ?? false,
              hasGrant: row !== undefined,
            }
          })
          .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
      )
      setError(null)
      setIsLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [reloadToken])

  /**
   * The policies read the table on every request, with no cache in between, so
   * this takes effect on the client's next tool call. The UI moves first and
   * rolls back on failure.
   */
  const setCanWrite = useCallback(async (clientId: string, canWrite: boolean) => {
    if (!userId.current) return

    let previous: OAuthConnection | undefined
    setConnections((current) =>
      current.map((connection) => {
        if (connection.clientId !== clientId) return connection
        previous = connection
        return { ...connection, canWrite, hasGrant: true }
      })
    )
    if (!previous) return

    const supabase = createClient()
    const { error: upsertError } = await supabase.from('oauth_grants').upsert(
      {
        user_id: userId.current,
        client_id: clientId,
        client_name: previous.clientName,
        // listGrants() does not return a redirect URI, so a row created here
        // rather than at consent time has nothing to record.
        redirect_uri: previous.redirectUri ?? '',
        can_write: canWrite,
      },
      { onConflict: 'user_id,client_id' }
    )

    if (upsertError) {
      const rollback = previous
      setConnections((current) =>
        current.map((connection) => (connection.clientId === clientId ? rollback : connection))
      )
      setError(upsertError.message)
      return
    }

    setError(null)
  }, [])

  /**
   * Revoke first, delete our row second. If the delete fails the grant is
   * already dead and the leftover row is swept on the next load. The other
   * order is worse: a deleted row under a live grant is a client that still
   * holds a token while the page claims it has no permissions.
   */
  const revoke = useCallback(async (clientId: string) => {
    setRevokingClientId(clientId)
    const supabase = createClient()

    const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId })
    if (revokeError) {
      setError(revokeError.message)
      setRevokingClientId(null)
      return
    }

    await supabase.from('oauth_grants').delete().eq('client_id', clientId)

    setConnections((current) => current.filter((connection) => connection.clientId !== clientId))
    setRevokingClientId(null)
    setReloadToken((token) => token + 1)
  }, [])

  return { connections, isLoading, error, revokingClientId, setCanWrite, revoke }
}
