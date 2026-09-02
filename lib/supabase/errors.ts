import type { PostgrestError } from '@supabase/supabase-js'

/**
 * The refusal the direct table writes can still provoke, and why it may not
 * reach the user as it arrives.
 *
 * `42501` is what every guard on this data raises: the restrictive policies,
 * and the triggers that keep the personal space undeletable and its owner
 * inside it. Postgres words those from the database's point of view — "The
 * default space cannot be deleted (space_id=...)" — so the text is neither
 * translated nor about anything the reader did.
 *
 * Anything else is a real fault and is passed through, the way the connections
 * page shows what Supabase said.
 *
 * Only `rename` and `remove` come through here now: everything about members
 * goes through an RPC, which answers with {@link RpcResult} instead.
 */
export function refusalMessage(
  error: PostgrestError,
  messages: { notAllowed: string }
): string {
  if (error.code === '42501') return messages.notAllowed
  return error.message
}

/**
 * What every membership RPC answers with. The functions return `jsonb`, never
 * rows, and they say three different things in three different ways:
 *
 * - an outcome the caller should expect arrives as data — `{ok: false, code}`;
 * - a missing right arrives as `42501`, which PostgREST turns into an `error`;
 * - anything else in `error` is a fault, ours or Supabase's.
 *
 * So an `error` from `supabase.rpc()` means a bug or a right that was never
 * granted, and `ok: false` is a normal answer with something to tell the
 * reader. {@link refusalMessage} still handles the first, unchanged.
 */
export interface RpcResult {
  ok: boolean
  code?: string
  [key: string]: unknown
}

/**
 * Null when the call succeeded; otherwise the sentence to show, looked up by
 * `code`. An unknown code falls back rather than leaking a database word into
 * the page: the set of codes grows in migrations, and a client that has not
 * been redeployed yet must still say something a person can read.
 */
export function rpcRefusal(
  result: RpcResult | null,
  messages: Record<string, string>,
  fallback: string
): string | null {
  if (result?.ok) return null
  const code = result?.code
  return (code ? messages[code] : undefined) ?? fallback
}
