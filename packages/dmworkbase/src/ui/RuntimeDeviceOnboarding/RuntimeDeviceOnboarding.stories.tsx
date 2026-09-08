import React, { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  buildRuntimeInstallCommand,
  type RuntimeInstallPlatform,
} from "../../features/runtime-device/installCommand";
import RuntimeDeviceOnboarding, { type RuntimeDeviceOnboardingLabels } from ".";

const labels: RuntimeDeviceOnboardingLabels = {
  title: "连接新设备",
  description: "添加后，Octo 就能使用这台设备上的 Coding Agent。",
  supportedAdapters: "支持",
  addDevice: "添加设备",
  modalTitle: "添加设备",
  modalDescription:
    "在要连接的电脑上运行安装命令。设备上线后会自动出现在 Octo 中。",
  macos: "macOS",
  windows: "Windows PowerShell",
  commandLabel: "安装命令",
  copyCommand: "复制命令",
  commandCopied: "已复制",
  tokenHint:
    "ENROLL_TOKEN 是短期、单次使用的设备凭证。不要将命令转发给其他人。",
  promptLabel: "安装后可以这样开始",
  prompt:
    "请检查这台设备上的 Coding Agent 是否就绪，并告诉我当前可用的 adapter。",
  copyPrompt: "复制提示词",
  promptCopied: "已复制",
  loadingEnrollment: "正在生成安全的一次性安装命令...",
  enrollmentFailed: "无法生成安装凭证。",
  retryEnrollment: "重试",
};

function StoryView({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [platform, setPlatform] = useState<RuntimeInstallPlatform>("macos");
  const command = useMemo(
    () =>
      buildRuntimeInstallCommand(
        platform,
        "https://im-test.deepminer.com.cn",
        "octo_enroll_story_only"
      ),
    [platform]
  );

  return (
    <div style={{ width: "min(720px, 90vw)", containerType: "inline-size" }}>
      <RuntimeDeviceOnboarding
        command={command}
        labels={labels}
        open={open}
        platform={platform}
        copied={null}
        enrollmentLoading={false}
        enrollmentError={false}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onPlatformChange={setPlatform}
        onCopyCommand={() => undefined}
        onCopyPrompt={() => undefined}
        onRetry={() => undefined}
      />
    </div>
  );
}

const meta: Meta<typeof RuntimeDeviceOnboarding> = {
  title: "UI/RuntimeDeviceOnboarding",
  component: RuntimeDeviceOnboarding,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof RuntimeDeviceOnboarding>;

export const Default: Story = { render: () => <StoryView /> };
export const DialogOpen: Story = { render: () => <StoryView initiallyOpen /> };
