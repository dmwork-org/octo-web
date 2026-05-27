import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLocale, localeStorageKey } from "../detectLocale";

const storage = new Map<string, string>();
const fakeWindow = {
  location: {
    search: "",
  },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
};

function setNavigatorLanguages(languages: readonly string[]) {
  vi.stubGlobal("navigator", {
    language: languages[0] || "",
    languages,
  });
}

function resetLocaleInputs() {
  storage.clear();
  fakeWindow.location.search = "";
  vi.stubGlobal("window", fakeWindow);
  setNavigatorLanguages(["en-US"]);
}

describe("detectLocale", () => {
  beforeEach(resetLocaleInputs);
  afterEach(() => {
    vi.unstubAllGlobals();
    storage.clear();
  });

  it("uses the explicit locale before browser preferences", () => {
    setNavigatorLanguages(["zh-CN"]);

    expect(detectLocale("en-US")).toBe("en-US");
  });

  it("uses query locale before persisted locale", () => {
    fakeWindow.localStorage.setItem(localeStorageKey, "zh-CN");
    fakeWindow.location.search = "?locale=en-US";

    expect(detectLocale()).toBe("en-US");
  });

  it("uses persisted locale before browser preferences", () => {
    fakeWindow.localStorage.setItem(localeStorageKey, "zh-CN");
    setNavigatorLanguages(["ja-JP"]);

    expect(detectLocale()).toBe("zh-CN");
  });

  it("defaults browser Chinese to zh-CN and other browser languages to en-US", () => {
    setNavigatorLanguages(["zh-Hant-HK"]);
    expect(detectLocale()).toBe("zh-CN");

    setNavigatorLanguages(["ja-JP", "zh-CN"]);
    expect(detectLocale()).toBe("en-US");
  });
});
