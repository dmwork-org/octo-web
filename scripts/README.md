# scripts/

开发工具脚本。

## Windows 说明

`package.json` 中的企业构建/工作流命令（`build:enterprise`、`build-ele:enterprise:*`、`dev:enterprise`、`new:worktree`、`cleanup:worktree`）统一通过 `run-bash-script.mjs` 执行 bash 脚本：在 Windows 上显式探测 Git for Windows 自带的 bash，避开 WSL 的 `C:\Windows\System32\bash.exe`（用它跑构建会进入 Linux 环境导致 node 工具链不匹配而失败）。装了 Git for Windows 即开箱即用；特殊情况可用环境变量 `OCTO_BASH` 显式指定 bash.exe 路径。Linux/macOS 直接使用系统 bash，行为不变。

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm gen:component <Name>` | 生成 ui/ + bridge/ 脚手架 |
| `pnpm dev:enterprise` | 使用 sibling 私有仓启动企业装配 dev server，本地自动识别 Loop/Drive |
| `pnpm build:enterprise` | CI/本地生产构建；本地自动识别 Loop/Drive，CI 尊重显式 entry |
| `pnpm new:worktree <branch> [base] [--yes]` | 建 worktree |
| `pnpm cleanup:worktree <branch> [--keep-remote] [--yes]` | 清理 worktree |
