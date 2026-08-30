import createMDX from '@next/mdx'
import type { NextConfig } from 'next'

// `pageExtensions` is deliberately not set: MDX lives in content/, outside app/,
// and is reached through a typed registry. No .mdx file is ever a route.
const nextConfig: NextConfig = {}

const withMDX = createMDX({
  options: {
    // Turbopack, the default bundler in Next 16, cannot receive JS functions
    // across the Rust boundary: plugins are named as strings and their options
    // must be JSON-serializable. See node_modules/next/dist/docs/01-app/02-guides/mdx.md
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: ['rehype-slug', ['rehype-autolink-headings', { behavior: 'wrap' }]],
  },
})

export default withMDX(nextConfig)
