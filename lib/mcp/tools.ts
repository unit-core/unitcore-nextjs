import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Relative, with the extension: tests/mcp-isolation.test.mts loads this module
// through Node's type stripping, which has no tsconfig path aliases. Anything
// this file reaches has to import the same way.
import { CONNECTIONS_URL, CONNECTOR_NAME } from '../connectors.ts'
import { TASK_READ_TOOLS, TASK_WRITE_TOOLS, registerTaskTools } from './tasks.ts'

export interface ToolContext {
  http?: { authInfo?: AuthInfo }
}

/**
 * How a tool gets its database handle.
 *
 * In production the client is derived from the caller's own access token (see
 * app/api/mcp/route.ts). It is injectable so that the isolation test can drive
 * these exact tool bodies with a client of its own — what that test checks is
 * the text the tools return, so they must not be reimplemented inside it.
 */
export interface ToolDeps {
  clientFor: (ctx: ToolContext) => SupabaseClient | null
  userIdFor: (ctx: ToolContext) => string | null
}

/** Tools that only read. The isolation test runs every one of them. */
export const READ_TOOLS = [
  'list_spaces',
  'list_categories',
  'list_transactions',
  'summary',
  ...TASK_READ_TOOLS,
] as const

/** Tools that write. Excluded from the isolation test so it leaves no rows behind. */
export const WRITE_TOOLS = [
  ...TASK_WRITE_TOOLS,
  'create_space',
  'rename_space',
  'create_categories',
  'update_category',
  'delete_categories',
  'create_transaction',
  'update_transaction',
  'delete_transaction',
  'update_transaction_item',
  'delete_transaction_item',
] as const

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
})

const fail = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
})

/**
 * What a client without write access actually hits, and what PostgREST says
 * about it: `new row violates row-level security policy for table
 * "transactions"`. A model reading that has no way to tell a missing
 * permission from a transient fault, so it guesses and retries. Every tool in
 * WRITE_TOOLS reports the refusal through here instead, naming the cause and
 * the page that fixes it. Anything else is passed through untouched.
 */
const failWrite = (error: PostgrestError) =>
  error.code === '42501' || error.message.includes('row-level security')
    ? fail(
        `This client has read-only access to your ${CONNECTOR_NAME} data. ` +
          `Turn on write access for it at ${CONNECTIONS_URL} and try again.`
      )
    : fail(error.message)

/**
 * The refusal that arrives silently. An UPDATE or a DELETE only sees the rows
 * its policy's USING clause lets through, so a row that belongs to someone
 * else — or that a read-only client may not touch — is filtered out before the
 * statement runs: PostgREST reports zero rows rather than 42501, and failWrite
 * never sees it. Nothing readable from under an OAuth token separates "not
 * yours" from "read-only" — oauth_grants is hidden from exactly this caller by
 * design — so the message names both instead of picking one and being
 * confidently wrong.
 */
const failNoRow = (lead: string) =>
  fail(
    `${lead}, or this client has read-only access to your ${CONNECTOR_NAME} data. ` +
      `Check its permissions at ${CONNECTIONS_URL}.`
  )

/** Falls back to the user's personal space, which a trigger guarantees exists. */
async function resolveSpaceId(db: SupabaseClient, spaceId?: string) {
  if (spaceId) return spaceId
  const { data, error } = await db
    .from('my_spaces')
    .select('id')
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No personal space found. Pass space_id explicitly.')
  return data.id as string
}

export function registerTools(server: McpServer, deps: ToolDeps) {
  const { clientFor, userIdFor } = deps

  // The second product's tools, registered from their own module: the two
  // schemas share nothing but this server and the caller's token.
  registerTaskTools(server, deps)

  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description:
        'Spaces the user has access to. is_default = true marks the personal space, ' +
        'which is used whenever space_id is omitted; is_mine = false means the space ' +
        'belongs to someone else and only its owner can rename or delete it.',
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      // my_spaces is a security_invoker view: same rows as spaces, but with
      // is_mine instead of a raw owner_id, so no foreign user id ever reaches
      // the answer.
      const { data, error } = await db
        .from('my_spaces')
        .select('id, name, is_default, is_mine, created_at')
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

        // The signed view joins the category in the database, so the items and
        // their category names arrive in one query.
        const { data: items } = await db
          .schema('budget')
          .from('transaction_items_signed')
          .select('transaction_id, name, amount, category_name, category_kind')
          .in('transaction_id', txs.map((t) => t.id))

        return ok(
          txs.map((t) => ({
            ...t,
            items: (items ?? [])
              .filter((i) => i.transaction_id === t.id)
              .map((i) => ({
                name: i.name,
                amount: Number(i.amount),
                category: i.category_name,
                kind: i.category_kind,
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

        // signed_amount comes from the view: the sign follows the category
        // kind, so the net figure is decided in the database rather than here.
        let q = db
          .schema('budget')
          .from('transaction_items_signed')
          .select('category_name, category_kind, currency_code, amount, signed_amount')
          .eq('space_id', spaceId)
        if (from) q = q.gte('occurred_at', from)
        if (to) q = q.lte('occurred_at', to)

        const { data: items, error } = await q
        if (error) return fail(error.message)

        const totals = new Map<string, { category: string; kind: string; currency: string; total: number }>()
        let net = 0

        for (const item of items ?? []) {
          const key = `${item.category_name ?? ''}|${item.currency_code}`
          const row = totals.get(key) ?? {
            category: item.category_name ?? 'Uncategorized',
            kind: item.category_kind ?? 'unknown',
            currency: item.currency_code,
            total: 0,
          }
          row.total += Number(item.amount)
          totals.set(key, row)
          net += Number(item.signed_amount ?? 0)
        }

        const rows = [...totals.values()].sort((a, b) => b.total - a.total)
        return ok({
          period: { from: from ?? null, to: to ?? null },
          by_category: rows,
          totals: {
            expense: rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.total, 0),
            income: rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.total, 0),
            net,
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
        .select('id, name, is_default, created_at')
        .single()
      return error ? failWrite(error) : ok(data)
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
          .select('id, name, is_default, updated_at')
          .maybeSingle()
        if (error) return failWrite(error)
        return data ? ok(data) : failNoRow('Space not found or you are not its owner')
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  server.registerTool(
    'create_categories',
    {
      title: 'Create categories',
      description:
        'New expense or income categories in a space — one or many, in a single call. Either all ' +
        'of them are created or none is. Names are not unique: a name that already exists gives a ' +
        'second category with that name, so list_categories first when in doubt.',
      inputSchema: z.object({
        categories: z
          .array(
            z.object({
              name: z.string().min(1),
              kind: z.enum(['expense', 'income']),
            })
          )
          .min(1)
          .max(50),
        space_id: z.string().uuid().optional(),
      }),
    },
    async ({ categories, space_id }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      try {
        const spaceId = await resolveSpaceId(db, space_id)
        const { data, error } = await db
          .schema('budget')
          .from('categories')
          .insert(categories.map((c) => ({ name: c.name, kind: c.kind, space_id: spaceId })))
          .select('id, name, kind')
        return error ? failWrite(error) : ok(data)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  )

  server.registerTool(
    'update_category',
    {
      title: 'Update category',
      description:
        'Renames a category or changes its kind. Only the fields passed are touched. Changing the ' +
        'kind rewrites history: every item already in this category starts counting as income ' +
        'instead of expense, or the other way round, and summary moves with it.',
      inputSchema: z.object({
        category_id: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
        kind: z.enum(['expense', 'income']).optional(),
      }),
    },
    async ({ category_id, name, kind }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      const patch = {
        ...(name !== undefined ? { name } : {}),
        ...(kind !== undefined ? { kind } : {}),
      }
      if (!Object.keys(patch).length) return fail('Nothing to change: pass name, kind, or both.')
      const { data, error } = await db
        .schema('budget')
        .from('categories')
        .update(patch)
        .eq('id', category_id)
        .select('id, name, kind, space_id')
        .maybeSingle()
      if (error) return failWrite(error)
      return data ? ok(data) : failNoRow('Category not found')
    }
  )

  server.registerTool(
    'delete_categories',
    {
      title: 'Delete categories',
      description:
        'Deletes categories by id — one or many. Nothing is lost with them: items that used a ' +
        'deleted category keep their amounts and become uncategorized, so summary still counts ' +
        'them, under "Uncategorized". Ids that were not deleted come back in not_deleted.',
      inputSchema: z.object({
        category_ids: z.array(z.string().uuid()).min(1).max(50),
      }),
    },
    async ({ category_ids }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      const { data, error } = await db
        .schema('budget')
        .from('categories')
        .delete()
        .in('id', category_ids)
        .select('id, name, kind')
      if (error) return failWrite(error)
      if (!data?.length) {
        return failNoRow(
          category_ids.length > 1 ? 'None of those categories were found' : 'Category not found'
        )
      }
      const deletedIds = new Set(data.map((c) => c.id))
      return ok({
        deleted: data,
        not_deleted: category_ids.filter((id) => !deletedIds.has(id)),
      })
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
        if (txError) return failWrite(txError)

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

  server.registerTool(
    'update_transaction',
    {
      title: 'Update transaction',
      description:
        'Changes a transaction. Only the fields passed are touched, and title: null clears it. ' +
        'Items follow their transaction: moving occurred_at or currency_code moves every item ' +
        'with it. To change what an item says, use update_transaction_item.',
      inputSchema: z.object({
        transaction_id: z.string().uuid(),
        title: z.string().nullable().optional(),
        occurred_at: z.string().optional(),
        currency_code: z.string().min(3).max(3).optional(),
      }),
    },
    async ({ transaction_id, title, occurred_at, currency_code }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      const patch = {
        ...(title !== undefined ? { title } : {}),
        ...(occurred_at !== undefined ? { occurred_at } : {}),
        ...(currency_code !== undefined ? { currency_code } : {}),
      }
      if (!Object.keys(patch).length) {
        return fail('Nothing to change: pass title, occurred_at or currency_code.')
      }
      const { data, error } = await db
        .schema('budget')
        .from('transactions')
        .update(patch)
        .eq('id', transaction_id)
        .select('id, title, occurred_at, currency_code')
        .maybeSingle()
      if (error) return failWrite(error)
      return data ? ok(data) : failNoRow('Transaction not found')
    }
  )

  server.registerTool(
    'delete_transaction',
    {
      title: 'Delete transaction',
      description:
        'Deletes a transaction with all of its items. The items go with it in the database, so ' +
        'there is nothing left to delete afterwards. This is also how a whole entry is removed ' +
        'when only one item is left in it.',
      inputSchema: z.object({
        transaction_id: z.string().uuid(),
      }),
    },
    async ({ transaction_id }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      const { data, error } = await db
        .schema('budget')
        .from('transactions')
        .delete()
        .eq('id', transaction_id)
        .select('id, title, occurred_at, currency_code')
        .maybeSingle()
      if (error) return failWrite(error)
      return data ? ok({ deleted: data }) : failNoRow('Transaction not found')
    }
  )

  server.registerTool(
    'update_transaction_item',
    {
      title: 'Update item',
      description:
        'Changes one item of a transaction. Only the fields passed are touched. The amount stays ' +
        'positive — an expense becomes income by moving the item to a category of the other kind, ' +
        'not by its sign — and category_id: null leaves the item uncategorized. Date and currency ' +
        'belong to the transaction, so they are changed with update_transaction.',
      inputSchema: z.object({
        item_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        amount: z.number().positive().optional(),
        category_id: z.string().uuid().nullable().optional(),
      }),
    },
    async ({ item_id, name, amount, category_id }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')
      const patch = {
        ...(name !== undefined ? { name } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(category_id !== undefined ? { category_id } : {}),
      }
      if (!Object.keys(patch).length) {
        return fail('Nothing to change: pass name, amount or category_id.')
      }
      const { data, error } = await db
        .schema('budget')
        .from('transaction_items')
        .update(patch)
        .eq('id', item_id)
        .select('id, transaction_id, name, amount, category_id')
        .maybeSingle()
      if (error) return failWrite(error)
      return data ? ok(data) : failNoRow('Item not found')
    }
  )

  server.registerTool(
    'delete_transaction_item',
    {
      title: 'Delete item',
      description:
        'Deletes one item of a transaction. The last item of a transaction is not deleted this ' +
        'way — an entry with nothing in it is not useful — delete the transaction instead.',
      inputSchema: z.object({
        item_id: z.string().uuid(),
      }),
    },
    async ({ item_id }, ctx) => {
      const db = clientFor(ctx)
      if (!db) return fail('No access token.')

      // Read before delete: the count is what decides whether this item may go
      // at all, and afterwards there is nothing left to count.
      const { data: item, error: readError } = await db
        .schema('budget')
        .from('transaction_items')
        .select('id, transaction_id')
        .eq('id', item_id)
        .maybeSingle()
      if (readError) return fail(readError.message)
      if (!item) return fail('Item not found.')

      const { count, error: countError } = await db
        .schema('budget')
        .from('transaction_items')
        .select('id', { count: 'exact', head: true })
        .eq('transaction_id', item.transaction_id)
      if (countError) return fail(countError.message)
      if ((count ?? 0) <= 1) {
        return fail(
          'This is the only item of its transaction. Deleting it would leave an empty entry — ' +
            `delete the transaction itself instead: delete_transaction ${item.transaction_id}.`
        )
      }

      const { data, error } = await db
        .schema('budget')
        .from('transaction_items')
        .delete()
        .eq('id', item_id)
        .select('id, transaction_id, name, amount, category_id')
        .maybeSingle()
      if (error) return failWrite(error)
      // The row was there a moment ago, so an empty answer here is the silent
      // refusal rather than a missing item.
      return data ? ok({ deleted: data }) : failNoRow('Item not deleted')
    }
  )
}
