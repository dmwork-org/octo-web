import { describe, expect, it } from "vitest";
import { resolveClientFeatureBuildEnv } from "../scripts/client-feature-build-env.mjs";

describe("client feature build environment", () => {
  it("allows normal production builds without opt-in", () => {
    expect(
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://prod.example" },
        { VITE_E2E_MOCK: "0", VITE_E2E_MOCK_IM: "0", VITE_API_URL: "https://vite.example" }
      )
    ).toEqual({
      apiURL: "https://prod.example",
      e2eMock: false,
      e2eMockIm: false,
      viteEnv: {
        VITE_API_URL: "https://prod.example",
        VITE_E2E_MOCK: "0",
        VITE_E2E_MOCK_IM: "0",
        VITE_SIDEBAR_CAPTURE: "0",
      },
    });
  });

  it("rejects mock builds without OCTO_ALLOW_MOCK_CLIENT_ARTIFACT", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://mock.example", VITE_E2E_MOCK: "1", VITE_E2E_MOCK_IM: "1" },
        {}
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("rejects mock-IM builds without OCTO_ALLOW_MOCK_CLIENT_ARTIFACT", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://mock.example", VITE_E2E_MOCK_IM: "1" },
        {}
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("allows mock builds with explicit OCTO_ALLOW_MOCK_CLIENT_ARTIFACT=1", () => {
    expect(
      resolveClientFeatureBuildEnv(
        {
          VITE_API_URL: "https://mock.example",
          VITE_E2E_MOCK: "1",
          VITE_E2E_MOCK_IM: "1",
          VITE_SIDEBAR_CAPTURE: "0",
          OCTO_ALLOW_MOCK_CLIENT_ARTIFACT: "1",
        },
        {}
      )
    ).toEqual({
      apiURL: "https://mock.example",
      e2eMock: true,
      e2eMockIm: true,
      viteEnv: {
        VITE_API_URL: "https://mock.example",
        VITE_E2E_MOCK: "1",
        VITE_E2E_MOCK_IM: "1",
        VITE_SIDEBAR_CAPTURE: "0",
      },
    });
  });

  it("detects mock flags from vite env file sources", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://prod.example" },
        { VITE_E2E_MOCK: "1", VITE_E2E_MOCK_IM: "1", VITE_API_URL: "https://prod.example" }
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("forwards opt-in production sidebar capture settings", () => {
    expect(
      resolveClientFeatureBuildEnv(
        {
          VITE_API_URL: "https://test.example",
          VITE_SIDEBAR_CAPTURE: "1",
          VITE_GIT_COMMIT: "web-commit-123",
        },
        { VITE_E2E_MOCK: "0", VITE_E2E_MOCK_IM: "0" }
      )
    ).toMatchObject({
      apiURL: "https://test.example",
      e2eMock: false,
      e2eMockIm: false,
      viteEnv: {
        VITE_SIDEBAR_CAPTURE: "1",
        VITE_GIT_COMMIT: "web-commit-123",
      },
    });
  });
  it("rejects API-only mock flags from process env without opt-in", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://mock.example", VITE_E2E_MOCK: "1" },
        {}
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("rejects IM-only mock flags from vite env file sources without opt-in", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://mock.example" },
        { VITE_E2E_MOCK_IM: "1", VITE_API_URL: "https://mock.example" }
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("does not treat the dirty-worktree opt-in as a mock-build opt-in", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        {
          VITE_API_URL: "https://mock.example",
          VITE_E2E_MOCK: "1",
          OCTO_ALLOW_DIRTY_CLIENT_ARTIFACT: "1",
        },
        {}
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("ignores a mock-build opt-in that arrives only through vite env file sources", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://mock.example" },
        {
          VITE_E2E_MOCK: "1",
          VITE_API_URL: "https://mock.example",
          OCTO_ALLOW_MOCK_CLIENT_ARTIFACT: "1",
        }
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });


  it("prefers explicit process values over loaded Vite values", () => {
    expect(() =>
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://process.example", VITE_E2E_MOCK: "1" },
        {
          VITE_API_URL: "https://vite.example",
          VITE_E2E_MOCK: "0",
          VITE_E2E_MOCK_IM: "1",
        }
      )
    ).toThrow("OCTO_ALLOW_MOCK_CLIENT_ARTIFACT");
  });

  it("prefers explicit process values over loaded Vite values with opt-in", () => {
    expect(
      resolveClientFeatureBuildEnv(
        { VITE_API_URL: "https://process.example", VITE_E2E_MOCK: "1", OCTO_ALLOW_MOCK_CLIENT_ARTIFACT: "1" },
        {
          VITE_API_URL: "https://vite.example",
          VITE_E2E_MOCK: "0",
          VITE_E2E_MOCK_IM: "1",
        }
      )
    ).toEqual({
      apiURL: "https://process.example",
      e2eMock: true,
      e2eMockIm: true,
      viteEnv: {
        VITE_API_URL: "https://process.example",
        VITE_E2E_MOCK: "1",
        VITE_E2E_MOCK_IM: "1",
        VITE_SIDEBAR_CAPTURE: "0",
      },
    });
  });
});
