import type { PostgrestError } from '@supabase/supabase-js'

/**
 * The two refusals the spaces UI can actually provoke, and why neither of them
 * may reach the user as it arrives.
 *
 * `42501` is what every guard on this data raises: the restrictive policies,
 * and the triggers that keep the personal space undeletable and its owner
 * inside it. Postgres words those in English, from the database's point of
 * view — "The default space cannot be deleted (space_id=...)" — so the text is
 * neither translated nor about anything the reader did.
 *
 * `23505` is the primary key of `space_members`: the person is already in the
 * space. It reads as a constraint violation, which sounds like a fault rather
 * than an answer.
 *
 * Anything else is a real fault and is passed through, the way the connections
 * page shows what Supabase said.
 */
export function refusalMessage(
  error: PostgrestError,
  messages: { notAllowed: string; duplicate?: string }
): string {
  if (error.code === '42501') return messages.notAllowed
  if (error.code === '23505' && messages.duplicate) return messages.duplicate
  return error.message
}
