# Local Mac Packager

本目录用于本机打 macOS Electron 包。脚本只包装当前仓库已有的企业 Electron 打包链路，不保存证书、密码或 Apple API key。

## 文件

| 文件 | 说明 |
|---|---|
| `package-enterprise-mac.sh` | 本地 mac 企业包入口 |
| `signing.env.example` | 本机私密配置模板 |

## 第一次使用

复制模板到 home 目录后按实际证书信息填写：

```bash
mkdir -p ~/.config
cp scripts/local-mac-packager/signing.env.example ~/.config/octo-local-mac-packager.env
chmod 600 ~/.config/octo-local-mac-packager.env
```

不要把 `~/.config/octo-local-mac-packager.env`、`.p8` 或证书文件提交到仓库。

## 打包

```bash
scripts/local-mac-packager/package-enterprise-mac.sh
```

脚本默认执行：

```bash
corepack pnpm build-ele:enterprise:mac
```

企业模块入口仍由 `scripts/ci-enterprise-electron-build.sh` 处理：本地未显式设置 `VITE_ENTERPRISE_MODULES_ENTRY` 时，会自动发现 sibling 私有仓。

## 当前边界

- 已集中加载本地签名、公证和环境变量。
- 当前项目还需要进一步确认 electron-builder notarize 配置是否显式启用。
- 当前根目录企业打包命令没有暴露 `mac-arm64` / `mac-x64` 细分入口；架构控制后续再补。
