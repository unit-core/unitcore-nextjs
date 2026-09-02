import { SITE_URL } from './i18n/urls.ts'

/**
 * The one value a reader ever types by hand, and the one the install links
 * carry. Built from SITE_URL so a preview deployment advertises itself rather
 * than production.
 */
export const MCP_URL = `${SITE_URL}/api/mcp`

/**
 * Only a label. It reaches nothing that decides permissions: write access is
 * granted per user to a `client_id`, and Claude registers itself as "Claude"
 * regardless of what the user types here.
 */
export const CONNECTOR_NAME = 'Unitcore'

/**
 * Where a user turns write access on or off for a connected client. Handed to
 * MCP clients inside the read-only error, so it must be absolute — and without
 * a locale, because `proxy.ts` prefixes the reader's own language.
 */
export const CONNECTIONS_URL = `${SITE_URL}/settings/connections`

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

/**
 * ChatGPT has no equivalent of Claude's prefill link: its "create app" dialog
 * cannot be handed a name and a URL, so the article pairs this with a copy
 * field instead. The hash route opens Settings straight at the section where
 * custom apps are created — the pane a reader has to reach anyway, one field
 * away from pasting MCP_URL. Some builds still label that section Connectors.
 */
export function chatgptAppsUrl(): string {
  return 'https://chatgpt.com/#settings/Connectors'
}
