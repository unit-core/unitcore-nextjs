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
