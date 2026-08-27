import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

const ISSUER = `${SUPABASE_URL}/auth/v1`

// Project JWTs are signed with ES256, so tokens are verified against the public
// JWKS rather than a shared secret. createRemoteJWKSet caches and rotates keys.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))

export interface VerifiedToken {
  userId: string
  email?: string
  clientId?: string
  scopes: string[]
}

/**
 * Verifies a Supabase-issued OAuth access token. Returns null on any failure —
 * callers translate that into a 401 rather than leaking the reason.
 */
export async function verifySupabaseToken(token: string): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: 'authenticated',
    })

    if (!payload.sub) return null

    const scope = typeof payload.scope === 'string' ? payload.scope : ''

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
      scopes: scope.split(' ').filter(Boolean),
    }
  } catch {
    return null
  }
}

/**
 * Supabase client acting as the user who owns the token.
 *
 * Row Level Security does the isolation: every query runs as that user, so a
 * tool cannot reach another user's rows even if it forgets to filter. The
 * service-role key must never be used here — it bypasses RLS entirely.
 *
 * Create one per request. On Fluid compute a shared client would leak one
 * user's credentials into another user's invocation.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
