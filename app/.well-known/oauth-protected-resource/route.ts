import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

// RFC 9728 discovery document. An MCP client hits this first to learn which
// authorization server issues tokens for this resource, which is what lets
// clients register themselves and start the OAuth flow without manual setup.
const handler = protectedResourceHandler({
  authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
})

const corsHandler = metadataCorsOptionsRequestHandler()

export { handler as GET, corsHandler as OPTIONS }
