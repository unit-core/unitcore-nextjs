/**
 * A profile tag as a person reads it: `MJK5VZSMWJ` -> `UC-MJK5-VZSMWJ`.
 *
 * Display only, and deliberately the whole of what the client knows about a
 * tag. Normalisation — case, spaces, dashes, the `UC-` prefix, `I`/`L` -> `1`
 * and `O` -> `0` — happens once, in `private.norm_tag`. A second set of rules
 * here would drift from that one the first time the alphabet changes, and the
 * two would disagree about what somebody just pasted.
 */
export function formatTag(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  return `UC-${value.slice(0, 4)}-${value.slice(4)}`
}
