/**
 * The MCP server must only ever hand a user their own rows.
 *
 * Isolation is enforced by RLS in the database, not by the tool bodies, so the
 * thing worth testing is the text a tool actually returns: that is what ends up
 * in an assistant's answer. The tools are driven directly, with a client built
 * from a real access token, so a broken policy, a view without
 * security_invoker, or a client that slipped past the publishable key all show
 * up here.
 *
 * Needs two accounts that share no space:
 *
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD
 *
 * Run with `npm test`. Without those variables the suite skips rather than
 * passing quietly.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

import type { McpServer } from '@modelcontextprotocol/server'
import { createClient } from '@supabase/supabase-js'

import {
  READ_TOOLS,
  WRITE_TOOLS,
  registerTools,
  type ToolContext,
  type ToolDeps,
} from '../lib/mcp/tools.ts'
import { createUserClient, verifySupabaseToken } from '../lib/supabase/mcp.ts'

type ToolResult = { content: Array<{ text: string }>; isError?: boolean }
type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

/** Arguments per read tool. Defaults live in the zod schemas, which only the
 *  real server applies, so anything without a default is spelled out here. */
const READ_ARGS: Record<string, Record<string, unknown>> = {
  list_spaces: {},
  list_categories: {},
  list_transactions: { limit: 50 },
  summary: {},
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

const env = (name: string) => process.env[name] ?? ''

const CREDENTIALS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
]

const missing = CREDENTIALS.filter((name) => !env(name))

/** Collects the tool handlers without standing up an MCP server. */
function collectTools(deps: ToolDeps): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>()
  const registrar = {
    registerTool: (name: string, _meta: unknown, handler: ToolHandler) => {
      tools.set(name, handler)
    },
  }
  registerTools(registrar as unknown as McpServer, deps)
  return tools
}

function depsForToken(accessToken: string): ToolDeps {
  const db = createUserClient(accessToken)
  return { clientFor: () => db, userIdFor: () => null }
}

async function signIn(email: string, password: string) {
  const auth = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`)
  return { token: data.session.access_token, userId: data.user!.id, email }
}

/** Everything the read tools reveal about a user: ids plus their address. */
async function fingerprint(token: string, email: string, userId: string) {
  const tools = collectTools(depsForToken(token))
  const texts: Record<string, string> = {}
  const ids = new Set<string>([userId, email])

  for (const name of READ_TOOLS) {
    const handler = tools.get(name)
    assert.ok(handler, `tool ${name} is not registered`)
    const result = await handler(READ_ARGS[name], {})
    assert.ok(!result.isError, `${name} failed for ${email}: ${result.content[0]?.text}`)
    const text = result.content.map((c) => c.text).join('\n')
    texts[name] = text
    for (const id of text.match(UUID) ?? []) ids.add(id.toLowerCase())
  }

  return { texts, ids }
}

describe('MCP tools return only the calling user’s data', { skip: missing.length ? `missing env: ${missing.join(', ')}` : false }, () => {
  let a: Awaited<ReturnType<typeof fingerprint>>
  let b: Awaited<ReturnType<typeof fingerprint>>
  let sessionTokenA = ''

  before(async () => {
    const userA = await signIn(env('TEST_USER_A_EMAIL'), env('TEST_USER_A_PASSWORD'))
    const userB = await signIn(env('TEST_USER_B_EMAIL'), env('TEST_USER_B_PASSWORD'))
    sessionTokenA = userA.token
    a = await fingerprint(userA.token, userA.email, userA.userId)
    b = await fingerprint(userB.token, userB.email, userB.userId)
  })

  it('the two accounts share nothing, so the comparison is meaningful', () => {
    const shared = [...b.ids].filter((id) => a.ids.has(id))
    assert.deepEqual(shared, [], 'test accounts share a space or an id — pick two unrelated accounts')
  })

  it('A sees data of their own', () => {
    const spaces = JSON.parse(a.texts.list_spaces) as unknown[]
    assert.ok(spaces.length > 0, 'A has no spaces, so a leak could not be told apart from an empty answer')
  })

  for (const tool of READ_TOOLS) {
    it(`${tool} leaks nothing belonging to B`, () => {
      for (const id of b.ids) {
        assert.ok(!a.texts[tool].includes(id), `${tool} returned ${id}, which belongs to B`)
      }
    })
  }

  it('every registered tool is covered or knowingly excluded', () => {
    const known = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS])
    for (const name of collectTools(depsForToken(sessionTokenA)).keys()) {
      assert.ok(known.has(name), `tool ${name} is in neither READ_TOOLS nor WRITE_TOOLS`)
    }
  })

  it('a web session token is not an MCP key', async () => {
    assert.equal(await verifySupabaseToken(sessionTokenA), null)
  })

  it('a forged token is rejected', async () => {
    assert.equal(await verifySupabaseToken('not.a.token'), null)
  })
})
