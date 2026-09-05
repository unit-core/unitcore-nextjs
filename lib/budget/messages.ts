import { type BudgetMessages } from '@/lib/budget/model'
import type { Dictionary } from '@/lib/i18n/dictionaries'

/**
 * The dictionary's budget errors, in the shape the hooks want.
 *
 * A copy rather than a cast, for the reason `taskMessages` gives: the dictionary
 * belongs to whoever writes the product's words, {@link BudgetMessages} is what
 * the write path promises to be able to say.
 */
export function budgetMessages(dict: Dictionary['dashboard']): BudgetMessages {
  const errors = dict.form.errors
  return {
    notAllowed: errors.notAllowed,
    silent: errors.silent,
    unknown: errors.unknown,
  }
}
