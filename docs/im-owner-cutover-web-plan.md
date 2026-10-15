# IM Web owner cutover adapter plan

日期：2026-10-15

## Behavior List

- Entry: Communication runtime receives an explicit owner-cutover command through the existing host bridge; there is no new user-visible menu, route, or button.
- Prepare: the current Web owner rejects new message side effects, keeps existing HTTP/ACK work observable, and reports readiness only after preparation has completed.
- Quiesce: send, history, read attention, receipt and reconnect paths are denied for the cutover generation; already accepted HTTP/ACK work remains tracked until settlement.
- Grant: the Web owner becomes active only after Main sends the exact opaque lease and the runtime confirms the matching owner/generation.
- Revoke/rollback: activation is revoked before teardown; physical SDK/socket closure and pending-work settlement are reported before the Web owner can be resumed.
- Space/session: a stale command, changed Space, logout, reload, or expired runtime scope is rejected without reviving the previous owner.
- Error states: malformed, stale, duplicate, unsupported-version, timeout, and unsettled-drain cases fail closed with sanitized fixed codes.

## File Map

- `apps/web/src/client-communication/hostBridge.ts`: typed owner-cutover command/report bridge fields.
- `apps/web/src/client-communication/runtime/ownerCutover.ts`: generation-scoped admission, pending HTTP/ACK registry, read-attention and SDK lifecycle adapter.
- `apps/web/src/client-communication/runtime/ownerCutover.test.ts`: unit tests for command validation, drain, grant/revoke and stale callbacks.
- `apps/web/src/client-communication/runtime/start.ts`: install and dispose the adapter for the existing Communication runtime owner.
- `apps/web/src/client-communication/index.tsx`: advertise the capability only when the adapter is installed.
- `apps/web/scripts/client-feature-build.mjs`: emit `ownerCutoverVersion: 1` only for an artifact that includes the adapter.
- `apps/web/src/client-communication/renderer-manifest.test.ts`: manifest capability regression coverage.

## PR Scope

This PR does:

- add the Web-side owner-cutover protocol and lifecycle adapter;
- cover the adapter with tests before enabling the capability in a production artifact;
- keep existing Web UI and message presentation unchanged;
- preserve `unknown + asynchronous ACK` semantics and prevent automatic replay.

This PR does not do:

- remove WebContentsView or migrate Renderer/UI;
- add SQLite confirmed cache, Outbox, or offline recovery;
- switch production authority by default;
- change Sidebar capture semantics or server API behavior.

Impact: Communication runtime, host bridge, artifact manifest and IM lifecycle tests only. The capability remains disabled until the adapter and manifest tests pass together.

## Verification Plan

- Automated tests: `pnpm exec vitest run apps/web/src/client-communication/runtime/ownerCutover.test.ts apps/web/src/client-communication/renderer-manifest.test.ts`.
- Runtime regression: existing Communication runtime, owner, read-attention, shadow-capture and Sidebar capture tests.
- Build: `pnpm --dir apps/web run build:e2e` and the production Communication artifact build.
- Manual path: start the Client with the current Web artifact, verify the capability is absent before the adapter build, then run a controlled prepare → quiesce → grant → revoke sequence with no overlapping writer and no stale callback publication.
- Regression points: Web remains the visible authority, current UI navigation remains unchanged, HTTP/ACK work is not replayed, and a legacy artifact without `ownerCutoverVersion` remains loadable but cannot participate in handoff.
