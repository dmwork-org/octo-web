import React from "react";
import {
  Bot,
  Check,
  Copy,
  Laptop,
  MessageSquareCode,
  MonitorCog,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import WKButton from "../../Components/WKButton";
import WKModal from "../../Components/WKModal";
import type { RuntimeInstallPlatform } from "../../features/runtime-device/installCommand";
import "./index.css";

export interface RuntimeDeviceOnboardingLabels {
  title: string;
  description: string;
  supportedAdapters: string;
  addDevice: string;
  modalTitle: string;
  modalDescription: string;
  macos: string;
  windows: string;
  commandLabel: string;
  copyCommand: string;
  commandCopied: string;
  tokenHint: string;
  promptLabel: string;
  prompt: string;
  copyPrompt: string;
  promptCopied: string;
  loadingEnrollment: string;
  enrollmentFailed: string;
  retryEnrollment: string;
}

export interface RuntimeDeviceOnboardingProps {
  command: string;
  labels: RuntimeDeviceOnboardingLabels;
  open: boolean;
  platform: RuntimeInstallPlatform;
  copied: "command" | "prompt" | null;
  enrollmentLoading: boolean;
  enrollmentError: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPlatformChange: (platform: RuntimeInstallPlatform) => void;
  onCopyCommand: () => void;
  onCopyPrompt: () => void;
  onRetry: () => void;
}

const adapters = [
  { name: "Codex", Icon: Bot },
  { name: "Claude Code", Icon: Sparkles },
  { name: "CodeBuddy", Icon: MessageSquareCode },
  { name: "OpenCode", Icon: TerminalSquare },
  { name: "OpenClaw", Icon: Workflow },
] as const;

export default function RuntimeDeviceOnboarding({
  command,
  labels,
  open,
  platform,
  copied,
  enrollmentLoading,
  enrollmentError,
  onOpen,
  onClose,
  onPlatformChange,
  onCopyCommand,
  onCopyPrompt,
  onRetry,
}: RuntimeDeviceOnboardingProps) {
  return (
    <>
      <section
        className="wk-runtime-device"
        aria-labelledby="wk-runtime-device-title"
      >
        <div className="wk-runtime-device__main">
          <span className="wk-runtime-device__icon" aria-hidden="true">
            <MonitorCog />
          </span>
          <div className="wk-runtime-device__copy">
            <h3 id="wk-runtime-device-title">{labels.title}</h3>
            <p>{labels.description}</p>
          </div>
          <WKButton
            type="button"
            variant="primary"
            icon={<Plus />}
            onClick={onOpen}
          >
            {labels.addDevice}
          </WKButton>
        </div>
        <div className="wk-runtime-device__adapters">
          <span>{labels.supportedAdapters}</span>
          <ul>
            {adapters.map(({ name, Icon }) => (
              <li key={name} title={name}>
                <Icon aria-hidden="true" />
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <WKModal
        visible={open}
        onCancel={onClose}
        title={labels.modalTitle}
        width="min(680px, calc(100vw - var(--wk-sp-8)))"
        className="wk-runtime-device-modal"
        options={{ maskClosable: true }}
      >
        <div className="wk-runtime-device-dialog">
          <p className="wk-runtime-device-dialog__description">
            {labels.modalDescription}
          </p>
          <div className="wk-runtime-device-dialog__platforms" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={platform === "macos"}
              className={platform === "macos" ? "is-active" : undefined}
              onClick={() => onPlatformChange("macos")}
            >
              <Laptop aria-hidden="true" />
              {labels.macos}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={platform === "windows"}
              className={platform === "windows" ? "is-active" : undefined}
              onClick={() => onPlatformChange("windows")}
            >
              <TerminalSquare aria-hidden="true" />
              {labels.windows}
            </button>
          </div>

          <section className="wk-runtime-device-dialog__section">
            <h4>{labels.commandLabel}</h4>
            <div className="wk-runtime-device-dialog__code">
              {command ? (
                <pre>
                  <code>{command}</code>
                </pre>
              ) : (
                <div
                  className={`wk-runtime-device-dialog__enrollment-state${
                    enrollmentError ? " is-error" : ""
                  }`}
                  role={enrollmentError ? "alert" : "status"}
                >
                  {enrollmentError
                    ? labels.enrollmentFailed
                    : labels.loadingEnrollment}
                </div>
              )}
              <button
                type="button"
                className="wk-runtime-device-dialog__copy"
                aria-label={labels.copyCommand}
                title={labels.copyCommand}
                onClick={onCopyCommand}
                disabled={!command}
              >
                {copied === "command" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                <span>
                  {copied === "command"
                    ? labels.commandCopied
                    : labels.copyCommand}
                </span>
              </button>
            </div>
            {enrollmentError ? (
              <button
                type="button"
                className="wk-runtime-device-dialog__retry"
                onClick={onRetry}
                disabled={enrollmentLoading}
              >
                <RefreshCw aria-hidden="true" />
                {labels.retryEnrollment}
              </button>
            ) : null}
            <p className="wk-runtime-device-dialog__hint">
              <ShieldCheck aria-hidden="true" />
              {labels.tokenHint}
            </p>
          </section>

          <section className="wk-runtime-device-dialog__section">
            <div className="wk-runtime-device-dialog__section-heading">
              <h4>{labels.promptLabel}</h4>
              <button type="button" onClick={onCopyPrompt}>
                {copied === "prompt" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copied === "prompt" ? labels.promptCopied : labels.copyPrompt}
              </button>
            </div>
            <p className="wk-runtime-device-dialog__prompt">{labels.prompt}</p>
          </section>
        </div>
      </WKModal>
    </>
  );
}
