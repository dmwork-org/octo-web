import React from "react";
import { Toast } from "@douyinfe/semi-ui";
import WKApp from "../../App";
import { t } from "../../i18n";
import { copyToClipboard } from "../../Utils/clipboard";
import RuntimeDeviceOnboarding, {
  type RuntimeDeviceOnboardingLabels,
} from "../../ui/RuntimeDeviceOnboarding";
import {
  buildRuntimeInstallCommand,
  resolveRuntimeServerOrigin,
  type RuntimeInstallPlatform,
} from "./installCommand";
import { requestRuntimeEnrollment } from "./enrollment";

export default function RuntimeDeviceSettings() {
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] =
    React.useState<RuntimeInstallPlatform>("macos");
  const [copied, setCopied] = React.useState<"command" | "prompt" | null>(null);
  const [enrollmentToken, setEnrollmentToken] = React.useState("");
  const [enrollmentLoading, setEnrollmentLoading] = React.useState(false);
  const [enrollmentError, setEnrollmentError] = React.useState(false);
  const enrollmentRequest = React.useRef(0);
  const resetTimer = React.useRef<number>();
  const labels: RuntimeDeviceOnboardingLabels = {
    title: t("base.navRail.settingsCenter.runtime.title"),
    description: t("base.navRail.settingsCenter.runtime.description"),
    supportedAdapters: t(
      "base.navRail.settingsCenter.runtime.supportedAdapters"
    ),
    addDevice: t("base.navRail.settingsCenter.runtime.addDevice"),
    modalTitle: t("base.navRail.settingsCenter.runtime.modalTitle"),
    modalDescription: t("base.navRail.settingsCenter.runtime.modalDescription"),
    macos: t("base.navRail.settingsCenter.runtime.macos"),
    windows: t("base.navRail.settingsCenter.runtime.windows"),
    commandLabel: t("base.navRail.settingsCenter.runtime.commandLabel"),
    copyCommand: t("base.navRail.settingsCenter.runtime.copyCommand"),
    commandCopied: t("base.navRail.settingsCenter.runtime.copied"),
    tokenHint: t("base.navRail.settingsCenter.runtime.tokenHint"),
    promptLabel: t("base.navRail.settingsCenter.runtime.promptLabel"),
    prompt: t("base.navRail.settingsCenter.runtime.prompt"),
    copyPrompt: t("base.navRail.settingsCenter.runtime.copyPrompt"),
    promptCopied: t("base.navRail.settingsCenter.runtime.copied"),
    loadingEnrollment: t(
      "base.navRail.settingsCenter.runtime.loadingEnrollment"
    ),
    enrollmentFailed: t("base.navRail.settingsCenter.runtime.enrollmentFailed"),
    retryEnrollment: t("base.navRail.settingsCenter.runtime.retryEnrollment"),
  };
  const serverOrigin = resolveRuntimeServerOrigin(
    import.meta.env.VITE_API_URL,
    WKApp.apiClient.config.apiURL,
    typeof window === "undefined" ? undefined : window.location.origin
  );
  const command = enrollmentToken
    ? buildRuntimeInstallCommand(platform, serverOrigin, enrollmentToken)
    : "";

  React.useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = async (kind: "command" | "prompt", value: string) => {
    const ok = await copyToClipboard(value);
    if (!ok) {
      Toast.error(t("base.navRail.settingsCenter.runtime.copyFailed"));
      return;
    }
    setCopied(kind);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  const loadEnrollment = React.useCallback(async () => {
    const requestId = ++enrollmentRequest.current;
    setEnrollmentToken("");
    setEnrollmentError(false);
    setEnrollmentLoading(true);
    try {
      const enrollment = await requestRuntimeEnrollment(
        WKApp.apiClient,
        WKApp.shared.currentSpaceId,
        serverOrigin
      );
      if (requestId === enrollmentRequest.current) {
        setEnrollmentToken(enrollment.enrollmentToken);
      }
    } catch {
      if (requestId === enrollmentRequest.current) setEnrollmentError(true);
    } finally {
      if (requestId === enrollmentRequest.current) setEnrollmentLoading(false);
    }
  }, [serverOrigin]);

  const close = () => {
    enrollmentRequest.current += 1;
    setOpen(false);
    setCopied(null);
    setEnrollmentToken("");
    setEnrollmentError(false);
    setEnrollmentLoading(false);
  };

  return (
    <RuntimeDeviceOnboarding
      command={command}
      labels={labels}
      open={open}
      platform={platform}
      copied={copied}
      enrollmentLoading={enrollmentLoading}
      enrollmentError={enrollmentError}
      onOpen={() => {
        setOpen(true);
        void loadEnrollment();
      }}
      onClose={close}
      onRetry={() => void loadEnrollment()}
      onPlatformChange={(next) => {
        setPlatform(next);
        setCopied(null);
      }}
      onCopyCommand={() => {
        if (command) void copy("command", command);
      }}
      onCopyPrompt={() => {
        void copy("prompt", labels.prompt);
      }}
    />
  );
}
