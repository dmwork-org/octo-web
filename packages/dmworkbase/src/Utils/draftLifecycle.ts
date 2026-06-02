export interface ShouldClearDraftAfterSendOptions {
    sentDraftSnapshot: string
    liveDraft?: string
    remoteDraft?: string
    draftSavedAfterSend: boolean
    latestSavedDraft?: string
}

export function shouldClearDraftAfterSend({
    liveDraft,
    draftSavedAfterSend,
    latestSavedDraft,
}: ShouldClearDraftAfterSendOptions): boolean {
    if (liveDraft) return false
    if (draftSavedAfterSend && latestSavedDraft) return false

    return true
}
