# scripts/

开发工具脚本。

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm gen:component <Name>` | 生成 ui/ + bridge/ 脚手架 |
| `pnpm dev:enterprise` | 使用 sibling 私有仓启动 loop/personal 企业装配 dev server |
| `pnpm build:enterprise` | CI/本地生产构建，要求 sibling 私有仓已 checkout |
| `pnpm new:worktree <branch> [base] [--yes]` | 建 worktree |
| `pnpm cleanup:worktree <branch> [--keep-remote] [--yes]` | 清理 worktree |
