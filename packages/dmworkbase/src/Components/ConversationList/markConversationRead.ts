import { captureCurrentImConversationSyncContext } from "../../im-runtime/conversationSyncContext";
import { isImReadAttentionAllowed, subscribeImReadAttention } from "../../im-runtime/readAttentionHost";

export interface MarkConversationReadRuntime {
  isCurrent(): boolean;
  clearUnread(): Promise<void>;
  updateLocalConversation(): void;
  updateFollowingUnread(): void;
  publishUnreadCleared(): void;
  reloadFollowingSidebar(): void;
  finishReminders(): Promise<void> | undefined;
  onError(error: unknown): void;
}

/** Keep every publication and follow-up bound to the explicit read's original owner. */
export async function markConversationRead(runtime: MarkConversationReadRuntime): Promise<void> {
  const contextIsCurrent = captureCurrentImConversationSyncContext();
  let attentionAllowed = isImReadAttentionAllowed();
  const isCurrent = () => attentionAllowed && isImReadAttentionAllowed() &&
    contextIsCurrent() && runtime.isCurrent();
  if (!isCurrent()) return;
  const unsubscribe = subscribeImReadAttention((allowed) => {
    if (!allowed) attentionAllowed = false;
  });
  try {
    await runtime.clearUnread();
    if (!isCurrent()) return;
    runtime.updateLocalConversation();
    if (!isCurrent()) return;
    runtime.updateFollowingUnread();
    if (!isCurrent()) return;
    runtime.publishUnreadCleared();
    if (!isCurrent()) return;
    runtime.reloadFollowingSidebar();
    if (!isCurrent()) return;
    await runtime.finishReminders();
  } catch (error) {
    if (isCurrent()) runtime.onError(error);
  } finally {
    unsubscribe();
  }
}
