import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Behaviour only — routing, anchor semantics, overflow. Type scale, rhythm and
 * colour belong to the `prose` class from @tailwindcss/typography; putting
 * sizes here means fighting that plugin's :where() selectors.
 */
const components: MDXComponents = {
  a: ({ href = '', children, ...props }) => {
    const isInternal = href.startsWith('/') || href.startsWith('#')
    if (isInternal) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    )
  },

  // rehype-slug puts the id on the heading and rehype-autolink-headings wraps
  // its text in an anchor; all that is left is to stop that anchor inheriting
  // the underline `prose` gives links.
  h2: (props) => <h2 className="scroll-mt-24 [&>a]:no-underline" {...props} />,
  h3: (props) => <h3 className="scroll-mt-24 [&>a]:no-underline" {...props} />,
  h4: (props) => <h4 className="scroll-mt-24 [&>a]:no-underline" {...props} />,

  pre: ({ className, ...props }) => (
    <pre className={cn('overflow-x-auto text-sm', className)} {...props} />
  ),
}

// Next 16 takes no arguments here; 13/14/15 passed the inherited components.
export function useMDXComponents(): MDXComponents {
  return components
}
