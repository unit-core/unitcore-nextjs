import { ArrowUpRight } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'

/**
 * A call to action inside an article: an external link wearing the primary
 * button. No state, so no 'use client' — same reason the landing page links
 * with `buttonVariants` instead of rendering a Button.
 */
export function InstallButton({
  href,
  children,
  note,
}: {
  href: string
  children: React.ReactNode
  /** One line under the button saying what will open. */
  note?: React.ReactNode
}) {
  return (
    <div className="not-prose my-6 flex flex-col items-start gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ size: 'lg' })}
      >
        {children}
        <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
      </a>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}
