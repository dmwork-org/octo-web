import { describe, expect, it } from "vitest";
import {
  buildRuntimeInstallCommand,
  ENROLL_TOKEN_PLACEHOLDER,
  resolveRuntimeServerOrigin,
} from "./installCommand";

describe("runtime device install command", () => {
  it("builds the macOS installer contract with the one-time token placeholder", () => {
    expect(
      buildRuntimeInstallCommand("macos", "https://im-test.deepminer.com.cn/")
    ).toContain(`"${ENROLL_TOKEN_PLACEHOLDER}"`);
    expect(
      buildRuntimeInstallCommand("macos", "https://im-test.deepminer.com.cn/")
    ).toContain("https://im-test.deepminer.com.cn/octo-harness/install.sh");
  });

  it("builds the PowerShell installer contract", () => {
    const command = buildRuntimeInstallCommand(
      "windows",
      "https://im-test.deepminer.com.cn"
    );
    expect(command).toContain("install.ps1");
    expect(command).toContain("[scriptblock]::Create");
  });

  it("prefers the browser origin that serves installers and the Worker facade", () => {
    expect(
      resolveRuntimeServerOrigin(
        "https://im-test.deepminer.com.cn/api/v1/",
        "/api/v1/",
        "http://localhost:3000"
      )
    ).toBe("http://localhost:3000");
  });

  it("falls back to the configured API origin for packaged shells", () => {
    expect(
      resolveRuntimeServerOrigin(
        "https://im-test.deepminer.com.cn/api/v1/",
        "/api/v1/",
        "file://"
      )
    ).toBe("https://im-test.deepminer.com.cn");
  });
});
