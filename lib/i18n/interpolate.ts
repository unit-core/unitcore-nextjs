/**
 * `fill('{name} invites you', { name: 'Denis' })`.
 *
 * The whole of our message formatting. Dictionary values are plain strings, so
 * a sentence that has to name somebody needs a placeholder rather than being
 * cut in half and reassembled in JSX — the halves would only make sense in the
 * language they were written in. An unknown placeholder is left where it is:
 * showing `{count}` is a bug somebody notices, an empty gap is not.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  )
}

/**
 * The same, for a sentence whose words change with the number in it.
 *
 * Most counts in this project are written to sidestep agreement — "members:
 * {count}", "Trash ({count})" — and that is still the cheaper answer whenever it
 * reads naturally. This exists for the one place where it does not: the warning
 * that says how many tasks a deleted list is about to move. That sentence is
 * the entire reason the dialog exists, so "1 задач переедут" is not a small
 * blemish, it is the warning failing to be read.
 *
 * The categories are the CLDR ones `Intl.PluralRules` returns: English uses
 * `one` and `other`, Russian additionally `few` and `many`. A dictionary lists
 * only the forms its language has, and anything missing falls back to `other`,
 * so adding a language is adding forms rather than editing call sites.
 */
export function plural(
  locale: string,
  forms: Record<string, string>,
  count: number,
  values: Record<string, string | number> = {}
): string {
  const category = new Intl.PluralRules(locale).select(count)
  const template = forms[category] ?? forms.other ?? ''
  return fill(template, { count, ...values })
}
