import { cn } from '@/lib/utils'

type CalloutType = 'note' | 'warning'

const STYLES: Record<CalloutType, string> = {
  note: 'border-border bg-muted',
  warning: 'border-destructive/40 bg-destructive/5',
}

/**
 * Imported explicitly at the top of an .mdx file rather than registered in
 * mdx-components.tsx: that map is for HTML element overrides, and an explicit
 * import is one a reader of the article source can follow.
 */
export function Callout({
  type = 'note',
  children,
}: {
  type?: CalloutType
  children: React.ReactNode
}) {
  return (
    <div className={cn('not-prose my-6 rounded-lg border p-4 text-sm', STYLES[type])}>
      {children}
    </div>
  )
}
