import { type NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 renamed middleware to proxy and requires the export to be named
// `proxy` (or be the default export); the registry block still ships the old name.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - api/mcp and .well-known - bearer-token endpoints, must not redirect
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/mcp|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
