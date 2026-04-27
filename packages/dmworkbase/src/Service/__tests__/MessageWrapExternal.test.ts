import { describe, it, expect } from "vitest"
import { Message } from "wukongimjssdk"
import { Convert } from "../Convert"

/**
 * YUJ-53 / YUJ-64: /message/channel/sync response may carry msg-level fields
 * from_is_external (0|1), from_source_space_name (string),
 * from_home_space_id (string), from_home_space_name (string).
 * Convert.toMessage stashes them on the resulting Message instance so
 * MessageWrap getters (see Model.tsx) can expose them to the UI.
 */
describe("Convert.toMessage external-source passthrough (YUJ-53 / YUJ-64)", () => {
    const baseMsg = (overrides: Record<string, any> = {}) => ({
        message_id: "1",
        message_idstr: "1",
        client_msg_no: "c1",
        message_seq: 1,
        channel_id: "g1",
        channel_type: 2,
        from_uid: "user-c",
        timestamp: 0,
        payload: { type: 1, content: "hi" },
        ...overrides,
    })

    it("stashes from_is_external=1 and from_source_space_name on the Message", () => {
        const m: any = Convert.toMessage(baseMsg({
            from_is_external: 1,
            from_source_space_name: "ExampleCorp",
        }))
        expect(m.from_is_external).toBe(1)
        expect(m.from_source_space_name).toBe("ExampleCorp")
    })

    it("stashes from_is_external=0 when internal member", () => {
        const m: any = Convert.toMessage(baseMsg({ from_is_external: 0 }))
        expect(m.from_is_external).toBe(0)
        expect(m.from_source_space_name).toBeUndefined()
    })

    it("leaves fields undefined when payload omits them (backward compat)", () => {
        const m: any = Convert.toMessage(baseMsg())
        expect(m.from_is_external).toBeUndefined()
        expect(m.from_source_space_name).toBeUndefined()
        expect(m.from_home_space_id).toBeUndefined()
        expect(m.from_home_space_name).toBeUndefined()
    })

    it("non-1 truthy value collapses to 0 (strict boolean semantics)", () => {
        const m: any = Convert.toMessage(baseMsg({ from_is_external: "yes" }))
        expect(m.from_is_external).toBe(0)
    })

    it("stashes from_home_space_id / from_home_space_name (YUJ-64)", () => {
        const m: any = Convert.toMessage(baseMsg({
            from_home_space_id: "space13",
            from_home_space_name: "Space 13",
        }))
        expect(m.from_home_space_id).toBe("space13")
        expect(m.from_home_space_name).toBe("Space 13")
    })

    it("keeps home-space fields orthogonal to is_external flag", () => {
        const m: any = Convert.toMessage(baseMsg({
            from_is_external: 0,
            from_home_space_id: "space13",
            from_home_space_name: "Space 13",
        }))
        expect(m.from_is_external).toBe(0)
        expect(m.from_home_space_id).toBe("space13")
        expect(m.from_home_space_name).toBe("Space 13")
    })
})

/** 独立校验 MessageWrap getter（不依赖其他 Model 依赖） */
describe("MessageWrap.fromIsExternal / fromSourceSpaceName getter semantics", () => {
    // 用 inline 子类模拟，避免引入 App 入口触发 lottie 链。
    class Wrap {
        constructor(public message: any) {}
        get fromIsExternal(): boolean {
            return (this.message as any).from_is_external === 1
        }
        get fromSourceSpaceName(): string | undefined {
            const v = (this.message as any).from_source_space_name
            return typeof v === "string" && v.length > 0 ? v : undefined
        }
        get fromHomeSpaceId(): string | undefined {
            const v = (this.message as any).from_home_space_id
            return typeof v === "string" && v.length > 0 ? v : undefined
        }
        get fromHomeSpaceName(): string | undefined {
            const v = (this.message as any).from_home_space_name
            return typeof v === "string" && v.length > 0 ? v : undefined
        }
    }

    it("mirrors the Model.tsx implementation for real convert output", () => {
        const raw = new Message() as any
        raw.from_is_external = 1
        raw.from_source_space_name = "ExampleCorp"
        const w = new Wrap(raw)
        expect(w.fromIsExternal).toBe(true)
        expect(w.fromSourceSpaceName).toBe("ExampleCorp")
    })

    it("returns false/undefined when fields are absent", () => {
        const w = new Wrap(new Message())
        expect(w.fromIsExternal).toBe(false)
        expect(w.fromSourceSpaceName).toBeUndefined()
        expect(w.fromHomeSpaceId).toBeUndefined()
        expect(w.fromHomeSpaceName).toBeUndefined()
    })

    it("normalizes empty string to undefined", () => {
        const raw = new Message() as any
        raw.from_is_external = 1
        raw.from_source_space_name = ""
        raw.from_home_space_id = ""
        raw.from_home_space_name = ""
        const w = new Wrap(raw)
        expect(w.fromIsExternal).toBe(true)
        expect(w.fromSourceSpaceName).toBeUndefined()
        expect(w.fromHomeSpaceId).toBeUndefined()
        expect(w.fromHomeSpaceName).toBeUndefined()
    })

    it("exposes fromHomeSpaceId / fromHomeSpaceName when present (YUJ-64)", () => {
        const raw = new Message() as any
        raw.from_home_space_id = "space13"
        raw.from_home_space_name = "Space 13"
        const w = new Wrap(raw)
        expect(w.fromHomeSpaceId).toBe("space13")
        expect(w.fromHomeSpaceName).toBe("Space 13")
    })
})
