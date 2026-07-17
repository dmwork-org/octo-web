// Title-bar presence for html docs: shows ONLY the current viewer's own avatar.
//
// Deliberately minimal (product ask): a single avatar for the viewer, and NEVER any
// Synced/Connecting/connection-state text. Unlike the rich EditorShell PresenceBar (which
// lists all awareness peers + a sync badge over a live Yjs provider), html docs are read-only
// with no collab provider, so there is no peer list and no connection state to show.

import { getCurrentUid } from '../octoweb/index.ts'
import { colorFromId } from '../awareness/presence.ts'

export function HtmlPresenceBar() {
  const uid = getCurrentUid()
  // No identity → render nothing (the viewer isn't resolvable, so an avatar would be misleading).
  if (!uid) return null
  // The viewer's display name is not exposed to the frontend (LoginInfo is uid/token only).
  // NEVER fall back to the doc's publisher identity here — that would show the owner's name on
  // an invited viewer's page (they'd appear to be the owner). uid initial is the safe identity.
  const displayName = uid
  const initial = displayName.slice(0, 1).toUpperCase()
  return (
    <div className="octo-html-doc-presence" data-testid="html-doc-presence">
      <span className="octo-avatar" style={{ backgroundColor: colorFromId(uid) }} title={displayName}>
        {initial}
      </span>
    </div>
  )
}
