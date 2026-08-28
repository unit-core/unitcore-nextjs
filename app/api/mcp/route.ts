import type { AuthInfo } from '@modelcontextprotocol/server'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { createUserClient, verifySupabaseToken } from '@/lib/supabase/mcp'

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
})

const fail = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
})

/** The token is carried per request, so the client is built per tool call. */
const clientFor = (ctx: { http?: { authInfo?: AuthInfo } }): SupabaseClient | null => {
  const token = ctx.http?.authInfo?.token
  return token ? createUserClient(token) : null
}

/** spaces.owner_id has no default, and RLS demands it equal auth.uid(). */
const userIdFor = (ctx: { http?: { authInfo?: AuthInfo } }): string | null => {
  const userId = ctx.http?.authInfo?.extra?.userId
  return typeof userId === 'string' ? userId : null
}

/** Falls back to the user's personal space, which a trigger guarantees exists. */
async function resolveSpaceId(db: SupabaseClient, spaceId?: string) {
  if (spaceId) return spaceId
  const { data, error } = await db
    .from('spaces')
    .select('id')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No personal space found. Pass space_id explicitly.')
  return data.id as string
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_spaces',
      {
        title: 'List spaces',
        description:
          'Spaces the user has access to. is_default = true marks the personal space, ' +
          'which is used whenever space_id is omitted.',
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        const { data, error } = await db
          .from('spaces')
          .select('id, name, is_default, owner_id, created_at')
          .order('is_default', { ascending: false })
        return error ? fail(error.message) : ok(data)
      }
    )

    server.registerTool(
      'list_categories',
      {
        title: 'List categories',
        description: 'Expense and income categories in a space.',
        inputSchema: z.object({
          space_id: z.string().uuid().optional(),
          kind: z.enum(['expense', 'income']).optional(),
        }),
      },
      async ({ space_id, kind }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)
          let q = db
            .schema('budget')
            .from('categories')
            .select('id, name, kind, space_id')
            .eq('space_id', spaceId)
          if (kind) q = q.eq('kind', kind)
          const { data, error } = await q.order('name')
          return error ? fail(error.message) : ok(data)
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )

    server.registerTool(
      'list_transactions',
      {
        title: 'List transactions',
        description:
          'Transactions with their items for a period. Dates are ISO (2026-08-01). ' +
          'Item amounts are always positive — the category kind decides expense or income.',
        inputSchema: z.object({
          space_id: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        }),
      },
      async ({ space_id, from, to, limit }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)

          let q = db
            .schema('budget')
            .from('transactions')
            .select('id, title, occurred_at, currency_code')
            .eq('space_id', spaceId)
          if (from) q = q.gte('occurred_at', from)
          if (to) q = q.lte('occurred_at', to)

          const { data: txs, error } = await q
            .order('occurred_at', { ascending: false })
            .limit(limit)
          if (error) return fail(error.message)
          if (!txs?.length) return ok([])

          const [{ data: items }, { data: cats }] = await Promise.all([
            db
              .schema('budget')
              .from('transaction_items')
              .select('id, transaction_id, category_id, name, amount')
              .in('transaction_id', txs.map((t) => t.id)),
            db.schema('budget').from('categories').select('id, name, kind').eq('space_id', spaceId),
          ])

          const catById = new Map((cats ?? []).map((c) => [c.id, c]))
          return ok(
            txs.map((t) => ({
              ...t,
              items: (items ?? [])
                .filter((i) => i.transaction_id === t.id)
                .map((i) => ({
                  name: i.name,
                  amount: Number(i.amount),
                  category: catById.get(i.category_id)?.name ?? null,
                  kind: catById.get(i.category_id)?.kind ?? null,
                })),
            }))
          )
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )

    server.registerTool(
      'summary',
      {
        title: 'Category summary',
        description:
          'Expense and income totals per category for a period — answers questions like ' +
          '"how much did I spend on food in July".',
        inputSchema: z.object({
          space_id: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      },
      async ({ space_id, from, to }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)

          let q = db
            .schema('budget')
            .from('transaction_items')
            .select('category_id, amount, currency_code')
            .eq('space_id', spaceId)
          if (from) q = q.gte('occurred_at', from)
          if (to) q = q.lte('occurred_at', to)

          const [{ data: items, error }, { data: cats }] = await Promise.all([
            q,
            db.schema('budget').from('categories').select('id, name, kind').eq('space_id', spaceId),
          ])
          if (error) return fail(error.message)

          const catById = new Map((cats ?? []).map((c) => [c.id, c]))
          const totals = new Map<string, { category: string; kind: string; currency: string; total: number }>()

          for (const item of items ?? []) {
            const cat = catById.get(item.category_id)
            const key = `${item.category_id}|${item.currency_code}`
            const row = totals.get(key) ?? {
              category: cat?.name ?? 'Uncategorized',
              kind: cat?.kind ?? 'unknown',
              currency: item.currency_code,
              total: 0,
            }
            row.total += Number(item.amount)
            totals.set(key, row)
          }

          const rows = [...totals.values()].sort((a, b) => b.total - a.total)
          return ok({
            period: { from: from ?? null, to: to ?? null },
            by_category: rows,
            totals: {
              expense: rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.total, 0),
              income: rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.total, 0),
            },
          })
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )

    server.registerTool(
      'create_space',
      {
        title: 'Create space',
        description:
          'A new space owned by the current user. The personal space is created ' +
          'automatically on sign-up, so there is no need to recreate it here.',
        inputSchema: z.object({
          name: z.string().trim().min(1),
        }),
      },
      async ({ name }, ctx) => {
        const db = clientFor(ctx)
        const userId = userIdFor(ctx)
        if (!db || !userId) return fail('No access token.')
        const { data, error } = await db
          .from('spaces')
          .insert({ name, owner_id: userId })
          .select('id, name, is_default, owner_id, created_at')
          .single()
        return error ? fail(error.message) : ok(data)
      }
    )

    server.registerTool(
      'rename_space',
      {
        title: 'Rename space',
        description:
          'Renames a space. Without space_id the personal space is renamed. ' +
          'Only the owner of a space can rename it.',
        inputSchema: z.object({
          name: z.string().trim().min(1),
          space_id: z.string().uuid().optional(),
        }),
      },
      async ({ name, space_id }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)
          const { data, error } = await db
            .from('spaces')
            .update({ name })
            .eq('id', spaceId)
            .select('id, name, is_default, owner_id, updated_at')
            .maybeSingle()
          if (error) return fail(error.message)
          // RLS hides spaces the user does not own, so an empty result is a
          // permission miss, not a database error.
          return data ? ok(data) : fail('Space not found, or you are not its owner.')
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )

    server.registerTool(
      'create_category',
      {
        title: 'Create category',
        description: 'A new expense or income category in a space.',
        inputSchema: z.object({
          name: z.string().min(1),
          kind: z.enum(['expense', 'income']),
          space_id: z.string().uuid().optional(),
        }),
      },
      async ({ name, kind, space_id }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)
          const { data, error } = await db
            .schema('budget')
            .from('categories')
            .insert({ name, kind, space_id: spaceId })
            .select('id, name, kind')
            .single()
          return error ? fail(error.message) : ok(data)
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )

    server.registerTool(
      'create_transaction',
      {
        title: 'Create transaction',
        description:
          'Creates a transaction with its items. Amounts are always positive: the category ' +
          'kind decides expense or income. Items inherit date and currency from the transaction.',
        inputSchema: z.object({
          items: z
            .array(
              z.object({
                name: z.string().min(1),
                amount: z.number().positive(),
                category_id: z.string().uuid().optional(),
              })
            )
            .min(1),
          title: z.string().optional(),
          occurred_at: z.string().optional(),
          currency_code: z.string().min(3).max(3).default('RUB'),
          space_id: z.string().uuid().optional(),
        }),
      },
      async ({ items, title, occurred_at, currency_code, space_id }, ctx) => {
        const db = clientFor(ctx)
        if (!db) return fail('No access token.')
        try {
          const spaceId = await resolveSpaceId(db, space_id)

          const { data: tx, error: txError } = await db
            .schema('budget')
            .from('transactions')
            .insert({
              space_id: spaceId,
              title: title ?? null,
              currency_code,
              ...(occurred_at ? { occurred_at } : {}),
            })
            .select('id, title, occurred_at, currency_code')
            .single()
          if (txError) return fail(txError.message)

          // space_id, occurred_at and currency_code are set by the
          // item_inherit_from_transaction trigger — passing them is pointless.
          const { data: rows, error: itemsError } = await db
            .schema('budget')
            .from('transaction_items')
            .insert(
              items.map((i) => ({
                transaction_id: tx.id,
                name: i.name,
                amount: i.amount,
                category_id: i.category_id ?? null,
              }))
            )
            .select('id, name, amount, category_id')

          if (itemsError) {
            // Keep the books clean: a transaction with no items is not useful.
            await db.schema('budget').from('transactions').delete().eq('id', tx.id)
            return fail(`Items were not saved, the transaction was rolled back: ${itemsError.message}`)
          }

          return ok({ transaction: tx, items: rows })
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e))
        }
      }
    )
  },
  { serverInfo: { name: 'unitcore-budget', version: '0.1.0' } }
)

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  const verified = await verifySupabaseToken(bearerToken)
  if (!verified) return undefined

  return {
    token: bearerToken,
    scopes: verified.scopes,
    clientId: verified.clientId ?? 'unknown',
    extra: { userId: verified.userId, email: verified.email },
  }
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true })

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
