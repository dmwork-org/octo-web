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

Current contract boundary (deliberately not a complete C2 artifact):

- The underlying Web adapter can capture history pages and command outcomes
  behind its internal opt-in, but this browser hook intentionally starts the
  bounded trace with realtime/read capture only. Exported fixture documents
  therefore do not include history message pages or `command.outcome` yet.
- Local pending messages are not emitted by the capture hook yet.
- The fixture therefore proves runtime capture and replay shape for the covered
  events; it must not be described as complete C2 parity.

Use `disposeCommunicationShadowCapture(page, testInfo)` to close the recorder
and attach deterministic JSON to the Playwright result.
