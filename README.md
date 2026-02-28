# DMWork Web

<a href="https://zh-hans.react.dev/" target="_blank" rel="noopener" style="display:inline-block;">
	<img src="https://img.shields.io/badge/React-17.0.2-%236CB52D.svg?logo=React" alt="React" />
</a> &nbsp;
<a href="https://ts.nodejs.cn/" target="_blank" rel="noopener" style="display:inline-block;">
	<img src="https://img.shields.io/badge/TypeScript-5.0.4-%236CB52D.svg?logo=TypeScript&logoColor=FFF" alt="TypeScript" />
</a> &nbsp;
<a href="https://turbo.build/repo" target="_blank" rel="noopener" style="display:inline-block;">
	<img src="https://img.shields.io/badge/Turborepo-2.0.9-%236CB52D.svg?logo=Turbo&logoColor=FFF" alt="Turbo" />
</a> &nbsp;
<a href="https://semi.design/zh-CN/" target="_blank" rel="noopener" style="display:inline-block;">
	<img src="https://img.shields.io/badge/Semi UI-2.24.2-%236CB52D.svg?logo=SemiUI" alt="SemiUI">
</a> &nbsp;

## 简介

DMWork Web/PC 客户端，支持 Web、Mac、Windows、Linux 多平台。基于 React + TypeScript + Turborepo 构建的即时通讯前端。

## 项目结构

```
dmwork-web/
├── apps/web/              # 主应用入口
├── packages/
│   ├── dmworkbase/        # 基础组件和工具
│   ├── dmworklogin/       # 登录/注册模块
│   ├── dmworkcontacts/    # 联系人模块
│   ├── dmworkdatasource/  # 数据源模块
│   ├── eslint-config-custom/
│   └── tsconfig/
├── turbo.json
└── package.json
```

## 开发

> 要求 Node.js >= 18，Yarn 1.22+

### 安装依赖

```bash
yarn install
```

### 本地开发

```bash
yarn dev
```

### 编译

```bash
yarn build
```

### 清除缓存

```bash
yarn clean
```

## Docker 部署

### 构建镜像

```bash
docker build -t dmwork-web:latest .
```

### 运行

```bash
docker run -d -p 82:80 \
  -e API_URL=http://your-api-server:8090 \
  dmwork-web:latest
```

或通过 docker-compose（参考 dmworkim 项目的 `docker/dmwork/docker-compose.yaml`）。

## Electron 桌面版

支持打包 Mac、Windows、Linux 桌面应用。

```bash
# 开发调试
yarn dev-ele

# 先编译
yarn build

# 打包 Mac
yarn build-ele:mac

# 打包 Windows
yarn build-ele:win

# 打包 Linux（在 apps/web 下执行）
yarn build-ele:linux
```

## 相关仓库

- [dmworkim](https://github.com/yujiawei/dmworkim) — 服务端
- [dmwork-adapters](https://github.com/yujiawei/dmwork-adapters) — AI Agent 适配器

## License

MIT
