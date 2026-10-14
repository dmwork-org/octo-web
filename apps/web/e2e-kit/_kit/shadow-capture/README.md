# Communication shadow capture fixture

`shadow-capture` is a test-only export bridge for the Web Communication entry.
It is installed only when the entry is built with `VITE_E2E_MOCK_IM=1` and is
available as `window.__octoCommunicationShadowCapture__` after Communication
startup completes.

The bridge starts a bounded `createCurrentImShadowTrace` against the already
installed `WKSDK.shared()` and current conversation store. It does not call
`connect`, replace the provider, retain a second store owner, or create a
second socket. The fake IM fixture can emit a real SDK `Message` through
`window.__mockImEmitMessage__`; this lets a browser test assert that the
captured document was produced by the Communication runtime listener path.

When `start()` is active, the same test-only API also starts a bounded sidebar
capture against that existing owner. `syncSidebar(tab)` delegates to the
configured `SidebarService.sync` and records the raw response (including
`version`, `follow_version`, and all wire items); `syncCategories(spaceId)`
delegates to `CategoryService.list` and records category order and group
metadata. `readSidebar()` / `disposeSidebar()` return the separate
`web-sidebar-capture` document, which also contains a canonical
`conversation.snapshot` from the already hydrated conversation store. These
methods do not retain the store, connect WKSDK, or install another provider.
Because this bridge is gated by `VITE_E2E_MOCK_IM=1`, its manifest uses
`captureProfile: "contract"`; it is not a production parity artifact.

Current contract boundary (deliberately not a complete C2 artifact):

- `startCommunicationShadowCapture` can opt into `captureCommandOutcomes`.
  The test-only bridge also exposes `syncMessages(channel, options)` and
  `markConversationUnread(channel, 0)`, which delegate to the installed
  provider and therefore produce real history message pages, read events, and
  `command.outcome` records in the bounded trace.
- Local pending messages are not emitted by the capture hook yet.
- The fixture therefore proves runtime capture and replay shape for the covered
  events; it must not be described as complete C2 parity.
- The sidebar artifact is a production-response capture only when the test
  invokes the real Web services in a Communication run; deterministic seed
  data alone must not be called production parity.

Use `disposeCommunicationShadowCapture(page, testInfo)` to close the recorder
and attach deterministic JSON to the Playwright result.
