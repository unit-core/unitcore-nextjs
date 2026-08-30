import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/i18n/urls'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Behind the session gate or machine-only; nothing here is worth indexing.
      disallow: ['/*/auth/', '/*/oauth/', '/*/protected', '/api/', '/.well-known/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
