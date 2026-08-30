import { SITE_URL } from '@/lib/i18n/urls'

/**
 * The one value a reader ever types by hand, and the one the install links
 * carry. Built from SITE_URL so a preview deployment advertises itself rather
 * than production.
 */
export const MCP_URL = `${SITE_URL}/api/mcp`

/**
 * Only a label. Write access is decided by `public.oauth_clients_allowed`,
 * matched against the client name the OAuth client registers itself under —
 * Claude sends "Claude" regardless of what the user types here.
 */
export const CONNECTOR_NAME = 'unitcore'

/**
 * Prefills Claude's "Add custom connector" dialog. Documented at
 * https://claude.com/docs/connectors/building/directory-vs-custom — the link
 * fills the form and nothing else: the user still reviews the values, confirms
 * the dialog, and signs in. `organization` targets the admin path, which is
 * where a Team or Enterprise owner adds a connector for everyone.
 */
export function claudeInstallUrl(scope: 'personal' | 'organization' = 'personal'): string {
  const path = scope === 'organization' ? 'admin-settings' : 'customize'
  // URLSearchParams percent-encodes the URL value, which the dialog requires.
  const params = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: CONNECTOR_NAME,
    connectorUrl: MCP_URL,
  })
  return `https://claude.ai/${path}/connectors?${params}`
}
