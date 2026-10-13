import { Channel, Message } from "wukongimjssdk"
import { ImOwnerAdmissionError } from "@octo/base/src/im-runtime/ownerAdmission"
import { beginImOwnerOperation, hasImOwnerAdmission } from "@octo/base/src/im-runtime/ownerAdmissionHost"

export interface MessageReadedCallbackDeps<T = void> {
    postMessageReaded: (path: string, body: Record<string, unknown>) => Promise<T>
    captureContext?: () => () => boolean
}

export function createMessageReadedCallback<T = void>(deps: MessageReadedCallbackDeps<T>) {
    return async function messageReadedCallback(channel: Channel, messages: Message[]) {
        const managed = hasImOwnerAdmission()
        const operation = beginImOwnerOperation("receipt")
        let contextIsCurrent = () => true
        const assertCurrent = () => {
            operation.assertCurrent()
            if (!contextIsCurrent()) throw new ImOwnerAdmissionError("owner_stale")
        }
        try {
            contextIsCurrent = deps.captureContext?.() ?? (() => true)
            assertCurrent()
            const result = await deps.postMessageReaded("message/readed", {
                channel_id: channel.channelID,
                channel_type: channel.channelType,
                message_ids: (messages ?? []).map(message => message.messageID),
            })
            assertCurrent()
            return result
        } catch (error) {
            assertCurrent()
            // Preserve ordinary Web's legacy callback contract; managed SDK cannot fake acceptance.
            if (managed) throw error
            return undefined
        } finally {
            operation.release()
        }
    }
}
