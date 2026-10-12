import { describe, expect, it } from "vitest";
import {
  ShadowTraceRecorder,
  attachShadowTraceCapture,
  type ShadowCaptureBindings,
  type ShadowCaptureManifest,
  type ShadowCaptureScope,
} from "./shadowCapture";

const manifest: ShadowCaptureManifest = {
  schemaVersion: 1,
  artifact: {
    name: "octo-web-client-communication",
    version: "1.0.12",
    commit: "dd90c017bd25bb6dda8617b6d49f6c91af115e1e",
    contractRevision: 3,
  },
  sdk: { name: "wukongimjssdk", version: "1.3.5" },
  redaction: "plain-dto-v1",
};

const scope: ShadowCaptureScope = {
  server: "https://im.example.test",
  account: "user-a",
  organization: "org-a",
  space: "space-a",
  channel: { id: "group-a", type: 2 },
  epoch: 1,
  sessionId: "session-a",
  transitionGeneration: 1,
};

describe("Web shadow trace capture", () => {
  it("records a deterministic document with the pinned artifact manifest", () => {
    const recorder = new ShadowTraceRecorder(manifest);
    recorder.record({
      type: "message.upsert",
      scope,
      source: "realtime",
      message: {
        id: "m1",
        sequence: 4,
        clientMsgNo: "client-1",
        payload: {
          text: "hello",
          method() {
            return "must not cross the boundary";
          },
        },
        remoteExtra: { isEdit: true },
      },
    });
    const document = recorder.toDocument();

    expect(document.manifest).toEqual(manifest);
    expect(document.events[0]).toMatchObject({
      type: "message.upsert",
      message: { id: "m1", clientMsgNo: "client-1", remoteExtra: { isEdit: true } },
    });
    expect((document.events[0] as any).message.payload.method).toBeUndefined();
    expect(recorder.toDocument()).toEqual(document);
  });

  it("attaches scope, message, unread, read, and command sources without owning them", () => {
    const recorder = new ShadowTraceRecorder(manifest);
    const scopeListeners = new Set<(next: ShadowCaptureScope) => void>();
    const messageListeners = new Set<(event: any) => void>();
    const unreadListeners = new Set<(event: any) => void>();
    const readListeners = new Set<(event: any) => void>();
    const commandListeners = new Set<(event: any) => void>();
    const bindings: ShadowCaptureBindings = {
      getScope: () => scope,
      onScopeChange(listener) { scopeListeners.add(listener); return () => scopeListeners.delete(listener); },
      onMessage(listener) { messageListeners.add(listener); return () => messageListeners.delete(listener); },
      onUnread(listener) { unreadListeners.add(listener); return () => unreadListeners.delete(listener); },
      onRead(listener) { readListeners.add(listener); return () => readListeners.delete(listener); },
      onCommandOutcome(listener) { commandListeners.add(listener); return () => commandListeners.delete(listener); },
    };
    const dispose = attachShadowTraceCapture(recorder, bindings);

    const nextScope = { ...scope, epoch: 2, transitionGeneration: 2 };
    for (const listener of scopeListeners) listener(nextScope);
    for (const listener of messageListeners) listener({
      type: "message.upsert",
      scope: nextScope,
      source: "realtime",
      message: { id: "m2", sequence: 5, payload: { text: "world" } },
    });
    for (const listener of unreadListeners) listener({
      type: "unread.set",
      scope: nextScope,
      source: "realtime",
      unread: { channel: nextScope.channel!, status: "ready", count: 2 },
    });
    for (const listener of readListeners) listener({
      type: "unread.read",
      scope: nextScope,
      channel: nextScope.channel!,
      readSequence: 5,
    });
    for (const listener of commandListeners) listener({
      type: "command.outcome",
      scope: nextScope,
      outcome: { command: "send", status: "unknown", clientMsgNo: "client-2" },
    });

    expect(recorder.getEvents().map(event => event.type)).toEqual([
      "scope.open",
      "scope.switch",
      "message.upsert",
      "unread.set",
      "unread.read",
      "command.outcome",
    ]);
    dispose();
    expect(scopeListeners).toHaveLength(0);
    expect(messageListeners).toHaveLength(0);
  });

  it("does not record events after disposal and disposes sources in reverse order", () => {
    const recorder = new ShadowTraceRecorder(manifest);
    const cleanupOrder: string[] = [];
    const bindings: ShadowCaptureBindings = {
      getScope: () => undefined,
      onMessage: listener => {
        void listener;
        return () => cleanupOrder.push("message");
      },
      onUnread: listener => {
        void listener;
        return () => cleanupOrder.push("unread");
      },
    };
    const dispose = attachShadowTraceCapture(recorder, bindings);
    dispose();
    dispose();

    expect(cleanupOrder).toEqual(["unread", "message"]);
    expect(recorder.getEvents()).toEqual([]);
  });
});
