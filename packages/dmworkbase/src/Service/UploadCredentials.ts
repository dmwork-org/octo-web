import { Channel } from "wukongimjssdk"
import axios from "axios"
import APIClient, { extractErrorMsg } from "./APIClient"
import { t } from "../i18n"
import { ImOwnerAdmissionError } from "../im-runtime/ownerAdmission"
import { beginImOwnerOperation } from "../im-runtime/ownerAdmissionHost"

interface UploadCredentials {
    uploadUrl: string
    downloadUrl: string
    contentType: string
    contentDisposition?: string
}

interface ChatUploadOwner {
    readonly signal: AbortSignal
    assertCurrent(): void
    release(): void
}

/** Service-local context avoids a dependency from the HTTP boundary back to WKApp. */
function beginChatUpload(): ChatUploadOwner {
    const controller = new AbortController()
    const client = APIClient.shared
    const config = client.config
    const token = config.tokenCallback?.()
    const space = config.spaceIdCallback?.()
    const revision = config.imContextRevisionCallback?.()
    const originRevision = config.originRevision
    const operation = beginImOwnerOperation("upload", () => controller.abort())
    return {
        signal: controller.signal,
        assertCurrent() {
            operation.assertCurrent()
            if (APIClient.shared !== client || client.config !== config ||
                config.originRevision !== originRevision || config.tokenCallback?.() !== token ||
                config.spaceIdCallback?.() !== space || config.imContextRevisionCallback?.() !== revision) {
                throw new ImOwnerAdmissionError("owner_stale")
            }
        },
        release: () => operation.release(),
    }
}

/**
 * GH #119/#135: preflight before creating the SDK bubble; errors retain backend msg.
 * The SDK task intentionally fetches fresh credentials again on the successful path.
 */
export async function precheckUploadCredentials(file: File, channel: Channel, extension: string): Promise<void> {
    const owner = beginChatUpload()
    try {
        await requestChatCredentials(file, channel, extension, owner)
        owner.assertCurrent()
    } finally {
        owner.release()
    }
}

/** Upload before composing a RichText payload, keeping one ticket through both requests. */
export async function uploadChatMedia(file: File, channel: Channel, extension: string): Promise<string> {
    const owner = beginChatUpload()
    try {
        const credentials = await requestChatCredentials(file, channel, extension, owner)
        owner.assertCurrent()
        const timeoutMs = Math.max(2 * 60 * 1000, file.size / (1024 * 1024) * 10 * 1000)
        const headers: Record<string, string> = { "Content-Type": credentials.contentType }
        if (credentials.contentDisposition) headers["Content-Disposition"] = credentials.contentDisposition
        try {
            const response = await axios.put(credentials.uploadUrl, file, {
                headers, timeout: timeoutMs, signal: owner.signal,
            })
            owner.assertCurrent()
            if (!(response.status >= 200 && response.status < 300)) {
                throwWithMsg(t("base.conversation.upload.failed"))
            }
        } catch (error) {
            owner.assertCurrent()
            if (error && typeof error === "object" && "msg" in error) throw error
            throwWithMsg((error instanceof Error ? error.message : "") || t("base.conversation.upload.failed"))
        }
        return credentials.downloadUrl
    } finally {
        // Abort is only a request; keep this ticket until the real HTTP Promise settles.
        owner.release()
    }
}

async function requestChatCredentials(
    file: File, channel: Channel, extension: string, owner: ChatUploadOwner,
): Promise<UploadCredentials> {
    owner.assertCurrent()
    const contentType = file.type || "application/octet-stream"
    const fileName = file.name || "file"
    const ext = extension ? `.${extension}` : ""
    const path = `/${channel.channelType}/${channel.channelID}/${genUploadUUID()}${ext}`
    let result: UploadCredentials | undefined
    try {
        result = await APIClient.shared.get<UploadCredentials>(
            `file/upload/credentials?path=${encodeURIComponent(path)}&type=chat&filename=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(contentType)}&fileSize=${file.size}`,
            { signal: owner.signal },
        )
        owner.assertCurrent()
    } catch (error) {
        owner.assertCurrent()
        throwWithMsg(extractErrorMsg(error) || (error instanceof Error ? error.message : "") || t("base.uploadCredentials.failed"))
    }
    if (!result || typeof result.uploadUrl !== "string" || typeof result.downloadUrl !== "string") {
        throwWithMsg(t("base.uploadCredentials.missingFields"))
    }
    return result
}

function throwWithMsg(msg: string): never {
    const error = new Error(msg) as Error & { msg: string }
    error.msg = msg
    throw error
}

function genUploadUUID(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => "0123456789ABCDEF"[byte % 16]).join("")
}
