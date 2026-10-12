import type {
  ShadowCaptureChannel,
  ShadowCaptureConversation,
  ShadowCaptureMessage,
  ShadowCaptureUnread,
} from "./shadowCapture";

export type ShadowCaptureSource = "history" | "realtime" | "local";

/** Convert an SDK-shaped message into a detached, JSON-safe capture DTO. */
export function normalizeShadowMessage(
  input: unknown,
  source: ShadowCaptureSource,
): ShadowCaptureMessage | undefined {
  void source;
  const value = record(input);
  if (!value) return undefined;
  const id = stringValue(value.messageID ?? value.messageId ?? value.id);
  const sequence = numberValue(value.messageSeq ?? value.messageSequence ?? value.sequence);
  if (!id || sequence === undefined) return undefined;

  const channel = normalizeShadowChannel(value.channel);
  return {
    id,
    sequence,
    payload: clonePlain(value.content ?? value.payload),
    ...(stringValue(value.clientMsgNo) ? { clientMsgNo: stringValue(value.clientMsgNo) } : {}),
    ...(numberValue(value.timestamp) !== undefined ? { timestamp: numberValue(value.timestamp) } : {}),
    ...(channel ? { channel } : {}),
    ...(stringValue(value.fromUID ?? value.fromUid) ? { fromUid: stringValue(value.fromUID ?? value.fromUid) } : {}),
    ...(stringValue(value.toUID ?? value.toUid) ? { toUid: stringValue(value.toUID ?? value.toUid) } : {}),
    ...("isDeleted" in value ? { deleted: Boolean(value.isDeleted) } : {}),
    ...("revoked" in value ? { revoked: Boolean(value.revoked) } : {}),
    ...("messageExtra" in value ? { messageExtra: clonePlain(value.messageExtra) } : {}),
    ...("remoteExtra" in value ? { remoteExtra: clonePlain(value.remoteExtra) } : {}),
    ...("reactions" in value ? { reactions: clonePlain(value.reactions) } : {}),
    ...("header" in value ? { header: clonePlain(value.header) } : {}),
    ...("setting" in value ? { setting: clonePlain(value.setting) } : {}),
    ...(stringOrNumber(value.contentType) !== undefined ? { contentType: stringOrNumber(value.contentType) } : {}),
    ...(stringOrNumber(value.status) !== undefined ? { status: stringOrNumber(value.status) } : {}),
    ...("noPersist" in value ? { noPersist: Boolean(value.noPersist) } : {}),
    ...(stringOrNumber(value.streamNo) !== undefined ? { streamNo: stringOrNumber(value.streamNo) } : {}),
    ...(numberValue(value.streamSeq) !== undefined ? { streamSeq: numberValue(value.streamSeq) } : {}),
    ...("stream" in value ? { stream: clonePlain(value.stream) } : {}),
  };
}

export function normalizeShadowConversation(
  input: unknown,
): ShadowCaptureConversation | undefined {
  const value = record(input);
  const channel = normalizeShadowChannel(value?.channel);
  if (!value || !channel) return undefined;
  const lastMessage = normalizeShadowMessage(value.lastMessage, "realtime");
  const extra = record(value.extra);
  const remoteExtra = record(value.remoteExtra);
  return {
    channel,
    ...(lastMessage?.id ? { lastMessageId: lastMessage.id } : {}),
    ...(lastMessage?.sequence !== undefined ? { lastMessageSequence: lastMessage.sequence } : {}),
    ...("archived" in value ? { archived: Boolean(value.archived) } : {}),
    ...((value.pinned === true || extra?.top === 1) ? { pinned: true } : {}),
    ...(numberValue(remoteExtra?.version ?? value.version) !== undefined
      ? { version: numberValue(remoteExtra?.version ?? value.version) }
      : {}),
  };
}

export function normalizeShadowUnread(
  input: unknown,
  status: ShadowCaptureUnread["status"] = "ready",
): ShadowCaptureUnread | undefined {
  const value = record(input);
  const channel = normalizeShadowChannel(value?.channel);
  if (!value || !channel) return undefined;
  const extra = record(value.extra);
  const rawCount = extra?.spaceUnread ?? value.unread ?? value.count;
  const count = rawCount === null ? null : numberValue(rawCount);
  if (count === undefined && count !== null) return undefined;
  return {
    channel,
    status,
    count,
    ...(numberValue(value.readSequence ?? value.lastReadMessageSeq) !== undefined
      ? { readSequence: numberValue(value.readSequence ?? value.lastReadMessageSeq) }
      : {}),
    ...(numberValue(record(value.remoteExtra)?.version ?? value.version) !== undefined
      ? { version: numberValue(record(value.remoteExtra)?.version ?? value.version) }
      : {}),
  };
}

export function normalizeShadowChannel(input: unknown): ShadowCaptureChannel | undefined {
  const value = record(input);
  if (!value) return undefined;
  const id = stringValue(value.channelID ?? value.channelId ?? value.id);
  const type = numberValue(value.channelType ?? value.type);
  if (!id || type === undefined) return undefined;
  return { id, type };
}

export function clonePlain<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return typeof value === "function" ? undefined as T : value;
  }
  if (seen.has(value)) return undefined as T;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => clonePlain(item, seen)) as T;
  if (value instanceof Date) return value.toISOString() as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function" || typeof item === "symbol" || item === undefined) continue;
    output[key] = clonePlain(item, seen);
  }
  return output as T;
}

function record(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function stringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
    ? value
    : undefined;
}
