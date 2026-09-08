# TES13 Settings center tools

## Metadata

- Case 类型: feature flow
- 目标模式: real-page seed
- 登录状态: authed fixture
- 优先级: P1
- Tags: `@TES13 @p1 @settings-center @tools`

## 目标

验证设置中心工具页能展示当前支持的键盘快捷键、我的设备 onboarding 和设备/扩展资源。

## 前置条件

- fixture: `fixtures-authed` (E2E_TARGET=local, mock 默认装)
- Per-case handler: 拦截 `POST /agent-worker/api/v1/device_enrollments`，返回短期、单次使用的 enrollment token。

## 用户操作步骤

1. 打开设置中心，将界面语言切换为 English。
2. 进入键盘快捷键。
3. 进入 My devices，点击 Add device。
4. 查看 macOS 命令并切换到 Windows PowerShell。
5. 进入设备资源页。

## 预期结果

- 键盘快捷键页显示 Voice input、Hold to talk 和 Cancel voice input。
- 键盘快捷键页不显示 New chat 或 Navigation。
- 设置侧栏显示独立的 My devices 项，页面显示 Connect a device 及 Codex、Claude Code、CodeBuddy、OpenCode、OpenClaw adapter。
- Add device 弹窗用当前 Space 请求 enrollment token，并把真实 token 写入命令；不得显示 `{{ENROLL_TOKEN}}` 占位符。macOS 使用 `install.sh`，Windows 使用 `install.ps1`。
- enrollment 请求使用 `POST`，并携带非空 `X-Space-ID`。
- 设备页显示 Android、iPhone、Windows、macOS、Octo Chrome Extension 和 OpenClaw Plugin。
- Windows 和 macOS 桌面端卡片显示 `Coming soon` 状态标签。
- 设备页显示 Mobile 和 Extensions and connections 分组。
- Android 下载链接指向 Octo Android releases 页面。
- Chrome Extension 的“Go to download”链接指向 Chrome Web Store。
- OpenClaw Plugin 的“View project”链接指向 `Mininglamp-OSS/openclaw-channel-octo` GitHub 仓库。

## 反例

- 若快捷键页出现已下线的 New chat 或 Navigation，说明页面注册表与实际支持能力不一致。
- 若资源卡片缺少任一已注册资源，说明设备资源配置没有完整渲染。

## 视觉基准

不建 pixel baseline; 只断言页面标题、资源名称、分组和链接。

## 摸清依据

- `packages/dmworkbase/src/Components/NavRail/settingsRegistry.ts:8-11`: shortcuts 和 devices 工具页注册。
- `packages/dmworkbase/src/Components/NavRail/settingsPages.tsx:82-85,89-92`: 工具页渲染快捷键和资源页面。
- `packages/dmworkbase/src/Components/NavRail/settingsPages.tsx:40-65,382-390`: 资源卡片定义、状态和 Android 下载链接。
- `apps/web/e2e-kit/msw-handlers/chat-baseline.ts`: Android/iOS updater baseline handler。
