import WKApp from "../App";
import CategoryService, { type CategoryItem } from "../Service/CategoryService";
import SidebarService, {
  type SidebarItem,
  type SidebarSyncReq,
  type SidebarSyncResp,
} from "../Service/SidebarService";
import {
  getCurrentImConversationStore,
  type CurrentImConversationStore,
} from "./currentConversationStore";

/** Test-only artifact contract consumed by the Client sidebar parity gate. */
export type SidebarCaptureManifest = {
  schemaVersion: 1;
  kind: "web-sidebar-capture";
  source: "octo-web" | string;
  captureProfile?: "production" | "contract";
  requiredTabs?: readonly ("recent" | "follow")[];
  followCategoryOrder?: readonly string[];
  captureId?: string;
  capturedAt?: string;
  artifact?: {
    name?: string;
    version?: string;
    commit?: string;
    contractRevision?: number;
    digest?: string;
  };
  redaction?: "plain-dto-v1";
};

export type SidebarCaptureScope = {
  server: string;
  account: string;
  organization?: string;
  space?: string;
  epoch: number;
  sessionId?: string;
  authGeneration?: string | number;
  transitionGeneration?: number;
};

export type SidebarCaptureConversation = {
  targetType: number;
  targetId: string;
  channel: { id: string; type: number };
  timestamp: number;
  unread: number;
  pinned: boolean;
  followed: boolean;
  childStatus: "active" | "archived" | "unknown";
  lastMessageId?: string;
  lastMessageSequence?: number;
  archived?: boolean;
  version?: number;
  spaceId?: string;
  sourceSpaceId?: string;
};

export type SidebarCaptureCategory = {
  categoryId: string | null;
  name: string;
  sort: number;
  groups?: readonly {
    groupNo: string;
    name?: string;
    categorySort?: number;
  }[];
  isDefault?: boolean;
};

export type SidebarCaptureEvent =
  | { type: "scope.open" | "scope.switch"; scope: SidebarCaptureScope }
  | {
      type: "conversation.snapshot";
      scope: SidebarCaptureScope;
      source: "conversation-sync";
      requestRevision: number;
      version: number;
      follow_version: number;
      freshness: string;
      conversations: readonly SidebarCaptureConversation[];
    }
  | {
      type: "sidebar.sync";
      source: "sidebar-sync";
      scope: SidebarCaptureScope;
      tab: "recent" | "follow";
      requestRevision: number;
      response: SidebarSyncResp;
      accepted: boolean;
      staleReason?: "scope" | "request";
    }
  | {
      type: "category.snapshot";
      scope: SidebarCaptureScope;
      requestRevision: number;
      version: number;
      categories: readonly SidebarCaptureCategory[];
      accepted: boolean;
      staleReason?: "scope" | "request";
    };

export type SidebarCaptureDocument = {
  manifest: SidebarCaptureManifest;
  events: readonly SidebarCaptureEvent[];
};

type StoreLike = Pick<CurrentImConversationStore, "conversations" | "freshness">;
type SidebarServiceLike = Pick<typeof SidebarService, "sync">;
type CategoryServiceLike = Pick<typeof CategoryService, "list">;

export type CurrentImSidebarCaptureOptions = {
  manifest: SidebarCaptureManifest;
  store?: StoreLike;
  getScope?: () => SidebarCaptureScope | undefined;
  sidebarService?: SidebarServiceLike;
  categoryService?: CategoryServiceLike;
  deviceUuid?: string | (() => string);
};

export type CurrentImSidebarCapture = {
  syncSidebar(
    tab: "recent" | "follow",
    options?: Omit<SidebarSyncReq, "tab" | "device_uuid">,
  ): Promise<{
    tab: "recent" | "follow";
    version: number;
    followVersion: number;
    items: readonly SidebarItem[];
    accepted: boolean;
    staleReason?: "scope" | "request";
  }>;
  syncCategories(spaceId?: string): Promise<Extract<SidebarCaptureEvent, { type: "category.snapshot" }>>;
  snapshotConversationStore(): Extract<SidebarCaptureEvent, { type: "conversation.snapshot" }> | null;
  toDocument(): SidebarCaptureDocument;
  dispose(): void;
};

/**
 * Attach a bounded, read-only capture to the existing Communication owner.
 *
 * This recorder intentionally does not retain/start the conversation store,
 * connect WKSDK, or install another provider.  `syncSidebar` and
 * `syncCategories` delegate to the already configured Web services so the
 * artifact contains their real response DTOs, while the conversation facts
 * come from the existing store instance.
 */
export function createCurrentImSidebarCapture(
  options: CurrentImSidebarCaptureOptions,
): CurrentImSidebarCapture {
  const store = options.store ?? getCurrentImConversationStore();
  const sidebarService = options.sidebarService ?? SidebarService;
  const categoryService = options.categoryService ?? CategoryService;
  const getScope = options.getScope ?? getDefaultSidebarScope;
  const events: SidebarCaptureEvent[] = [];
  const requestRevisions = { recent: 0, follow: 0, category: 0, conversation: 0 };
  let disposed = false;
  let previousScopeKey = "";

  const currentScope = (): SidebarCaptureScope | undefined => {
    const scope = getScope();
    if (!scope) return undefined;
    const nextKey = scopeKey(scope);
    if (!previousScopeKey) {
      events.push({ type: "scope.open", scope: clonePlain(scope) });
    } else if (nextKey !== previousScopeKey) {
      events.push({ type: "scope.switch", scope: clonePlain(scope) });
    }
    previousScopeKey = nextKey;
    return scope;
  };

  currentScope();

  const snapshotConversationStore = () => {
    if (disposed) return null;
    const scope = currentScope();
    if (!scope) return null;
    const event: Extract<SidebarCaptureEvent, { type: "conversation.snapshot" }> = {
      type: "conversation.snapshot",
      scope: clonePlain(scope),
      source: "conversation-sync",
      requestRevision: ++requestRevisions.conversation,
      version: requestRevisions.conversation,
      follow_version: 0,
      freshness: String(store.freshness),
      conversations: store.conversations.map(normalizeConversation),
    };
    events.push(event);
    return clonePlain(event);
  };

  // Capture the facts already hydrated by the owner. This is deliberately a
  // snapshot read; it does not create a holder or trigger a sync.
  snapshotConversationStore();

  const syncSidebar = async (
    tab: "recent" | "follow",
    syncOptions: Omit<SidebarSyncReq, "tab" | "device_uuid"> = {},
  ) => {
    if (disposed) throw new Error("Sidebar capture is disposed");
    const revision = ++requestRevisions[tab];
    const scopeAtStart = currentScope();
    if (!scopeAtStart) throw new Error("Sidebar capture scope is unavailable");
    snapshotConversationStore();
    const response = await sidebarService.sync({
      ...syncOptions,
      tab,
      device_uuid: resolveDeviceUuid(options.deviceUuid),
    });
    const scopeAtEnd = currentScope();
    const accepted = scopeKey(scopeAtStart) === scopeKey(scopeAtEnd)
      && revision === requestRevisions[tab]
      && !disposed;
    const event: Extract<SidebarCaptureEvent, { type: "sidebar.sync" }> = {
      type: "sidebar.sync",
      source: "sidebar-sync",
      scope: clonePlain(scopeAtStart),
      tab,
      requestRevision: revision,
      response: clonePlain(response),
      accepted,
      ...(accepted ? {} : {
        staleReason: scopeKey(scopeAtStart) !== scopeKey(scopeAtEnd) ? "scope" : "request",
      }),
    };
    events.push(event);
    return {
      tab,
      version: safeNumber(response.version),
      followVersion: safeNumber(response.follow_version),
      items: response.items ?? [],
      accepted,
      ...(accepted ? {} : {
        staleReason: scopeKey(scopeAtStart) !== scopeKey(scopeAtEnd) ? "scope" : "request",
      }),
    };
  };

  const syncCategories = async (spaceId = WKApp.shared.currentSpaceId) => {
    if (disposed) throw new Error("Sidebar capture is disposed");
    const revision = ++requestRevisions.category;
    const scopeAtStart = currentScope();
    if (!scopeAtStart) throw new Error("Sidebar capture scope is unavailable");
    const categories = await categoryService.list(spaceId);
    const scopeAtEnd = currentScope();
    const accepted = scopeKey(scopeAtStart) === scopeKey(scopeAtEnd)
      && revision === requestRevisions.category
      && !disposed;
    const event: Extract<SidebarCaptureEvent, { type: "category.snapshot" }> = {
      type: "category.snapshot",
      scope: clonePlain(scopeAtStart),
      requestRevision: revision,
      version: revision,
      categories: categories.map(normalizeCategory),
      accepted,
      ...(accepted ? {} : {
        staleReason: scopeKey(scopeAtStart) !== scopeKey(scopeAtEnd) ? "scope" : "request",
      }),
    };
    events.push(event);
    return clonePlain(event);
  };

  return {
    syncSidebar,
    syncCategories,
    snapshotConversationStore,
    toDocument: () => ({ manifest: clonePlain(options.manifest), events: events.map(clonePlain) }),
    dispose: () => {
      disposed = true;
    },
  };
}

function normalizeConversation(input: unknown): SidebarCaptureConversation {
  const value = record(input);
  const channel = record(value?.channel);
  const lastMessage = record(value?.lastMessage);
  const extra = record(value?.extra) ?? {};
  const remoteExtra = record(value?.remoteExtra)
    ? value.remoteExtra
    : {};
  return {
    targetType: safeNumber(channel?.channelType),
    targetId: String(channel?.channelID ?? ""),
    channel: { id: String(channel?.channelID ?? ""), type: safeNumber(channel?.channelType) },
    timestamp: typeof value?.timestamp === "number" && Number.isFinite(value.timestamp) ? value.timestamp : 0,
    unread: typeof value?.unread === "number" && Number.isFinite(value.unread) ? Math.max(0, value.unread) : 0,
    pinned: value?.pinned === true || extra.top === 1,
    followed: extra.is_followed === true,
    childStatus: value?.archived === true ? "archived" : "unknown",
    ...(lastMessage?.messageID ? { lastMessageId: String(lastMessage.messageID) } : {}),
    ...(Number.isSafeInteger(lastMessage?.messageSeq)
      ? { lastMessageSequence: lastMessage.messageSeq }
      : {}),
    ...(typeof value?.archived === "boolean" ? { archived: value.archived } : {}),
    ...(Number.isSafeInteger(remoteExtra.version ?? value?.version)
      ? { version: remoteExtra.version ?? value?.version } : {}),
    ...(typeof extra.spaceId === "string" ? { spaceId: extra.spaceId } : {}),
    ...(typeof extra.mySourceSpaceId === "string" ? { sourceSpaceId: extra.mySourceSpaceId } : {}),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeCategory(input: CategoryItem): SidebarCaptureCategory {
  return {
    categoryId: input.category_id == null ? null : String(input.category_id),
    name: String(input.name ?? ""),
    sort: safeNumber(input.sort),
    ...(Array.isArray(input.groups) ? {
      groups: input.groups.map(group => ({
        groupNo: String(group.group_no ?? ""),
        ...(typeof group.name === "string" ? { name: group.name } : {}),
        ...(Number.isFinite(group.category_sort) ? { categorySort: group.category_sort } : {}),
      })),
    } : {}),
    ...(typeof input.is_default === "boolean" ? { isDefault: input.is_default } : {}),
  };
}

function getDefaultSidebarScope(): SidebarCaptureScope | undefined {
  const config = WKApp.apiClient.config;
  const login = WKApp.loginInfo;
  const server = typeof config.apiURL === "string" ? config.apiURL : "";
  const account = typeof login.uid === "string" ? login.uid : "";
  if (!server || !account) return undefined;
  const epoch = Math.max(
    1,
    revision(WKApp.shared.spaceRevision)
      + revision(login.sessionRevision)
      + revision(config.originRevision)
      + 1,
  );
  return {
    server,
    account,
    ...(WKApp.shared.currentSpaceId ? { space: WKApp.shared.currentSpaceId } : {}),
    epoch,
    authGeneration: login.sessionRevision,
    transitionGeneration: epoch,
  };
}

function resolveDeviceUuid(input: string | (() => string) | undefined): string {
  const value = typeof input === "function" ? input() : input;
  if (typeof value === "string" && value) return value;
  return typeof WKApp.shared.deviceId === "string" ? WKApp.shared.deviceId : "";
}

function scopeKey(scope: SidebarCaptureScope | undefined): string {
  if (!scope) return "";
  return JSON.stringify(scope);
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function revision(value: unknown): number {
  return safeNumber(value);
}

function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "function" || typeof item === "symbol" || item === undefined) continue;
    output[key] = clonePlain(item);
  }
  return output as T;
}
