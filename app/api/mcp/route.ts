import type { AuthInfo } from '@modelcontextprotocol/server'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'

import { registerTools, type ToolContext, type ToolDeps } from '@/lib/mcp/tools'
import { createUserClient, verifySupabaseToken } from '@/lib/supabase/mcp'

/**
 * Every tool acts as the caller and nobody else: the client is built from the
 * caller's own access token, which is what puts RLS in charge of isolation.
 * The token is carried per request, so the client is built per tool call.
 */
const httpDeps: ToolDeps = {
  clientFor: (ctx: ToolContext) => {
    const token = ctx.http?.authInfo?.token
    return token ? createUserClient(token) : null
  },
  /** spaces.owner_id has no default, and RLS demands it equal auth.uid(). */
  userIdFor: (ctx: ToolContext) => {
    const userId = ctx.http?.authInfo?.extra?.userId
    return typeof userId === 'string' ? userId : null
  },
}

const handler = createMcpHandler((server) => registerTools(server, httpDeps), {
  serverInfo: { name: 'unitcore-budget', version: '0.1.0' },
})

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  const verified = await verifySupabaseToken(bearerToken)
  if (!verified) return undefined

  return {
    token: bearerToken,
    scopes: verified.scopes,
    clientId: verified.clientId,
    extra: { userId: verified.userId, email: verified.email },
  }
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true })

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
