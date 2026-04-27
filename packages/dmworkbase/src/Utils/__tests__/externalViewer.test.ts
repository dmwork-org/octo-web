import { describe, it, expect, vi, beforeEach } from "vitest"

// App 入口有副作用（lottie/Howler 等），测试中用 hoisted mock 替换 default export。
vi.mock("../../App", () => ({
    default: {
        shared: {
            currentSpaceId: "",
        },
    },
}))

import { resolveExternalForViewer } from "../externalViewer"
import WKApp from "../../App"

describe("resolveExternalForViewer (YUJ-64)", () => {
    beforeEach(() => {
        ;(WKApp as any).shared.currentSpaceId = ""
    })

    it("returns external=true when home_space_id differs from viewer space", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: "ExampleCorp",
            homeSpaceName: "ExampleCorp",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("ExampleCorp")
    })

    it("returns external=false when home_space_id equals viewer space", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: "space13",
            homeSpaceName: "Space 13",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(false)
        expect(r.sourceSpaceName).toBe("")
    })

    it("viewer = ExampleCorp: member A with home space13 is external (new behavior)", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: "space13",
            homeSpaceName: "Space 13",
            viewerSpaceId: "ExampleCorp",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("Space 13")
    })

    it("falls back to is_external=1 + source_space_name when home_space_id absent", () => {
        const r = resolveExternalForViewer({
            isExternalLegacy: 1,
            sourceSpaceNameLegacy: "ExampleCorp",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("ExampleCorp")
    })

    it("falls back to non-external when home_space_id absent and is_external=0", () => {
        const r = resolveExternalForViewer({
            isExternalLegacy: 0,
            sourceSpaceNameLegacy: "",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(false)
        expect(r.sourceSpaceName).toBe("")
    })

    it("treats empty homeSpaceId as absent and uses legacy fallback", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: "",
            homeSpaceName: "",
            isExternalLegacy: 1,
            sourceSpaceNameLegacy: "ExampleCorp",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("ExampleCorp")
    })

    it("defaults viewerSpaceId to WKApp.shared.currentSpaceId", () => {
        ;(WKApp as any).shared.currentSpaceId = "space13"
        const r = resolveExternalForViewer({
            homeSpaceId: "ExampleCorp",
            homeSpaceName: "ExampleCorp",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("ExampleCorp")
    })

    it("returns external=true with empty sourceSpaceName when home_name is absent", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: "ExampleCorp",
            homeSpaceName: "",
            viewerSpaceId: "space13",
        })
        expect(r.isExternal).toBe(true)
        expect(r.sourceSpaceName).toBe("")
    })

    it("handles null/undefined gracefully", () => {
        const r = resolveExternalForViewer({
            homeSpaceId: null,
            homeSpaceName: null,
            isExternalLegacy: null,
            sourceSpaceNameLegacy: null,
            viewerSpaceId: null,
        })
        expect(r.isExternal).toBe(false)
        expect(r.sourceSpaceName).toBe("")
    })
})
