/* eslint-disable no-undef */
// spec: apps/web/e2e-kit/case-specs/settings-center/settings/TES13-settings-center-tools.md
import { test, expect } from "../../../fixtures-authed";
import { prepareVoiceConversation } from "../voice/settings-center-voice-support";
import {
  registerTES13RuntimeEnrollment,
  type TES13EnrollmentObservation,
} from "../../../msw-handlers/tes13-runtime-enrollment";

test("@TES13 @p1 @settings-center @tools 工具页展示快捷键和资源", async ({
  authedPage,
}) => {
  const enrollmentToken = "octo_enroll_e2e_only";
  await prepareVoiceConversation(
    authedPage,
    { shortcutWindows: "alt-right", speakingMode: "hold" },
    "TES13 工具页群"
  );
  await registerTES13RuntimeEnrollment(authedPage, enrollmentToken);
  await authedPage.getByRole("button", { name: "设置" }).click();
  await authedPage
    .getByRole("combobox", { name: "界面语言" })
    .selectOption("en-US");
  const content = authedPage.getByTestId("settings-center-content");

  await authedPage.getByTestId("settings-center-nav-shortcuts").click();
  await expect(content).toContainText("Voice input");
  await expect(content).toContainText("Hold to talk");
  await expect(content).toContainText("Cancel voice input");
  await expect(content).not.toContainText("New chat");
  await expect(content).not.toContainText("Navigation");
  await expect(
    content.locator(".wk-settings-center__shortcut-row")
  ).toHaveCount(2);
  await expect(content.locator("kbd")).toHaveCount(3);

  await authedPage.getByTestId("settings-center-nav-my-devices").click();
  await expect(
    content.getByText("Connect a device", { exact: true })
  ).toBeVisible();
  for (const adapter of [
    "Codex",
    "Claude Code",
    "CodeBuddy",
    "OpenCode",
    "OpenClaw",
  ]) {
    await expect(content.getByText(adapter, { exact: true })).toBeVisible();
  }
  await content.getByRole("button", { name: "Add device" }).click();
  const runtimeDialog = authedPage
    .getByRole("dialog")
    .filter({ has: authedPage.locator(".wk-runtime-device-dialog") });
  await expect(runtimeDialog).toBeVisible();
  await expect(runtimeDialog).toContainText("install.sh");
  await expect(runtimeDialog).toContainText(enrollmentToken);
  await expect(runtimeDialog).not.toContainText("{{ENROLL_TOKEN}}");
  const enrollmentObservation = await authedPage.evaluate<
    TES13EnrollmentObservation | undefined
  >(
    () =>
      (
        window as unknown as {
          __tes13EnrollmentObservation?: TES13EnrollmentObservation;
        }
      ).__tes13EnrollmentObservation
  );
  expect(enrollmentObservation).toEqual({
    method: "POST",
    token: "e2e-mock-token",
    spaceId: "e2e-space-001",
  });
  await runtimeDialog.getByRole("tab", { name: "Windows PowerShell" }).click();
  await expect(runtimeDialog).toContainText("install.ps1");
  await runtimeDialog.getByRole("button", { name: "Close" }).click();

  await authedPage.getByTestId("settings-center-nav-devices").click();

  for (const name of [
    "Android",
    "iPhone",
    "Windows",
    "macOS",
    "Octo Chrome Extension",
    "OpenClaw Plugin",
  ]) {
    await expect(content.getByText(name, { exact: true })).toBeVisible();
  }
  const desktopSection = content
    .locator("section")
    .filter({ hasText: /^Desktop/ });
  const desktopCards = desktopSection.locator(
    '[data-resource-status="coming-soon"]'
  );
  await expect(desktopCards).toHaveCount(2);
  await expect(desktopCards).toHaveText([/Coming soon/, /Coming soon/]);
  await expect(content).toContainText("Mobile");
  await expect(content).toContainText("Extensions and connections");
  await expect(content).toContainText("Source: ClawHub · GitHub");
  await expect(
    authedPage.getByRole("link", { name: "Download from GitHub" })
  ).toHaveAttribute(
    "href",
    "https://github.com/Mininglamp-OSS/octo-android/releases/latest"
  );
  await expect(
    authedPage.getByRole("link", { name: "Go to download" })
  ).toHaveAttribute(
    "href",
    "https://chromewebstore.google.com/detail/octo-%E6%8F%92%E4%BB%B6%E7%89%88/nemameogpfkponoomeblkjcnbidgmndk"
  );
  await expect(
    authedPage.getByRole("link", { name: "View project" })
  ).toHaveAttribute(
    "href",
    "https://github.com/Mininglamp-OSS/openclaw-channel-octo"
  );
});
