import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Native <details>, so it opens with no JavaScript and stays open when the
 * reader prints or searches the page. Children are spaced by the wrapper
 * because `not-prose` strips the paragraph margins typography would give them.
 */
export function Disclosure({
  summary,
  children,
}: {
  summary: string
  children: React.ReactNode
}) {
  return (
    <details className="not-prose group my-6 rounded-lg border bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {/* Two icons rather than a rotation: group-open:rotate-90 resolves to
            0deg here, while hidden/block is unambiguous and needs no transform
            variable plumbing. */}
        <ChevronRight className="size-4 shrink-0 group-open:hidden" aria-hidden="true" />
        <ChevronDown className="hidden size-4 shrink-0 group-open:block" aria-hidden="true" />
        {summary}
      </summary>
      <div className="space-y-3 border-t p-4 text-sm text-muted-foreground">{children}</div>
    </details>
  )
}
