import { describe, expect, it } from "vitest";
import {
  buildUpdaterCheckUrl,
  getDownloadedUpdateFileName,
  getMacAppBundlePath,
  getUpdaterPlatform,
  isZipUpdatePackage,
  parseUpdateInfo,
} from "../updateCore";

describe("desktop updater core", () => {
  it("maps Electron platforms to updater system path segments", () => {
    expect(getUpdaterPlatform("darwin")).toBe("macos");
    expect(getUpdaterPlatform("win32")).toBe("windows");
    expect(getUpdaterPlatform("linux")).toBe("linux");
  });

  it("builds macOS updater check URLs", () => {
    expect(
      buildUpdaterCheckUrl({
        updaterApiUrl: "https://im.deepminer.com.cn/api/v1/common/updater/",
        version: "1.0.0",
        platform: "darwin",
      }),
    ).toBe("https://im.deepminer.com.cn/api/v1/common/updater/macos/1.0.0");
  });

  it("builds Windows updater check URLs", () => {
    expect(
      buildUpdaterCheckUrl({
        updaterApiUrl: "https://im.deepminer.com.cn/api/v1/common/updater",
        version: "0.1.0",
        platform: "win32",
      }),
    ).toBe("https://im.deepminer.com.cn/api/v1/common/updater/windows/0.1.0");
  });

  it("accepts http(s) updater manifest URLs", () => {
    expect(
      parseUpdateInfo({
        version: "1.0.0",
        url: " https://cdn.example.com/OCTO-Setup-1.0.0.exe ",
        notes: "Windows update",
        pub_date: "2026-08-20T00:00:00Z",
        force_update: true,
      }),
    ).toEqual({
      version: "1.0.0",
      url: "https://cdn.example.com/OCTO-Setup-1.0.0.exe",
      notes: "Windows update",
      pub_date: "2026-08-20T00:00:00Z",
      signature: "",
      forceUpdate: true,
    });
  });

  it("accepts updater download URL aliases and common force update fields", () => {
    expect(
      parseUpdateInfo({
        version: "1.0.0",
        download_url: "https://cdn.example.com/OCTO-1.0.0-arm64.dmg",
        mandatory: "1",
      }),
    ).toMatchObject({
      url: "https://cdn.example.com/OCTO-1.0.0-arm64.dmg",
      forceUpdate: true,
    });
  });

  it("rejects updater manifest URLs that cannot be opened safely", () => {
    expect(() => parseUpdateInfo({ version: "1.0.0", url: "file:///tmp/app.exe" })).toThrow(
      "Updater response url must be http(s)",
    );
  });

  it("builds safe local filenames for downloaded update packages", () => {
    expect(
      getDownloadedUpdateFileName("https://cdn.example.com/releases/OCTO-1.0.0-arm64.dmg", "1.0.0", "macos"),
    ).toBe("OCTO-1.0.0-arm64.dmg");
    expect(
      getDownloadedUpdateFileName("https://cdn.example.com/releases/", "1.0.0", "windows"),
    ).toBe("OCTO-1.0.0.exe");
  });

  it("detects zip update packages", () => {
    expect(isZipUpdatePackage("https://cdn.example.com/OCTO-1.0.0-universal.zip")).toBe(true);
    expect(isZipUpdatePackage("/Users/me/Library/Application Support/OCTO/updates/OCTO-1.0.0-universal.zip")).toBe(true);
    expect(isZipUpdatePackage("https://cdn.example.com/OCTO-1.0.0-universal.dmg")).toBe(false);
  });

  it("resolves the owning macOS app bundle from the executable path", () => {
    expect(getMacAppBundlePath("/Applications/OCTO.app/Contents/MacOS/OCTO")).toBe("/Applications/OCTO.app");
    expect(getMacAppBundlePath("/Users/me/Downloads/OCTO.app/Contents/MacOS/OCTO")).toBe("/Users/me/Downloads/OCTO.app");
  });
});
