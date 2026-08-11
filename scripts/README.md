# scripts/

开发工具脚本。

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm gen:component <Name>` | 生成 ui/ + bridge/ 脚手架 |
| `pnpm dev:enterprise` | 使用 sibling 私有仓启动企业装配 dev server，本地自动识别 Loop/Drive |
| `pnpm build:enterprise` | CI/本地生产构建；本地自动识别 Loop/Drive，CI 尊重显式 entry |
| `pnpm new:worktree <branch> [base] [--yes]` | 建 worktree |
| `pnpm cleanup:worktree <branch> [--keep-remote] [--yes]` | 清理 worktree |
