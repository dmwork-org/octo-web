# Web 消息 owner drain 实施记录

日期：2026-10-13。节点：Client 消息迁移 C3-1b。

基线：已 fetch `upstream/main`，新分支直接基于 `26c542585a412d23c8b7d0d9a5f988be5b1f0c71`。此前 capture 分支保留作为验收参考。工作树为 `im-shadow-capture`，分支为 `codex/im-web-owner-drain`。

## 行为清单

- 入口沿用 Client Communication bootstrap；不增加菜单、按钮或路由。
- 普通 Web 未安装 owner 控制器时维持当前行为。内嵌 Communication 在首次 SDK 连接之前安装同一个消息准入控制器。
- quiesce 同步禁止新 connect/send/history/read/receipt/upload，保持 read attention deny；已开始工作保留起始 generation 并等待真实 settle。
- send 的本地 Message 返回不代表服务端 accepted；SDK ACK 单独登记。排空失败、迟到操作或物理 socket 未关闭均不能报告成功。
- resume 的资源准备与 writer grant 分离；后续可信 IPC 节点负责 scope/session/request 校验和显式授权。当前不接自动 authority 切换。
- HTTP/凭据获取后的旧结果不得发布；卸载 keepalive 和直接 SDK send 不能绕过准入。unknown send 不自动重发。
- 账号、Space 和 runtime generation 是独立上下文；此节点不把相同 channel 当作同一个 owner。

## 文件地图

- `packages/dmworkbase/src/im-runtime/ownerAdmission*.ts`：headless singleton host、opaque operation ticket、generation、在途计数和 drain。
- `apps/web/src/client-communication/runtime/messageOwner*.ts`：Communication 生命周期组装与 SDK adapter；私有 SDK 字段只进入 adapter。
- `packages/dmworkbase/src/im-runtime/readAttentionHost.ts`：允许 owner deny 在 quiesce/teardown 后保持；不误恢复普通 Web allowance。
- datasource 的 message/conversation provider 与 upload task：在真实 HTTP/上传 Promise 边界接入准入和 stale guard。
- Conversation 的 unload helper：封装原有 keepalive 已读写入并接入准入。
- `apps/web/src/client-communication/index.tsx` 与 `runtime/start.ts`：首次 startup 前安装，后续清理使用异步 endpoint。
- 同域 tests：验证真实调用点，保留 fake 和真实 SDK lifecycle 验证的证据边界。

## PR 范围

主线为 Web 消息 owner 的准入、排空和 SDK 关闭基础能力。共享层影响普通 Web、内嵌 Communication、转发及 summary 直接 SDK send；未安装 owner 控制器时不施加新权限。

不迁移 Docs 产品、SQLite confirmed cache、Renderer/UI，不改变 HTTP 路径或成功含义，不升级发布 pin，不把同步 dispose 或配置 marker 作为 handoff 成功。

## 验证计划

- `pnpm --dir packages/dmworkbase exec vitest run src/im-runtime/ownerAdmission*.test.ts src/im-runtime/readAttentionHost.test.ts`：同步关闭、在途 settle、stale callback、重复释放及永久 deny。
- Communication owner/SDK tests：首次连接顺序、迟到地址、send ACK 与 unknown、timer/queue cleanup、raw socket close、清理失败保持无 writer。
- datasource/provider/upload 与 unload tests：请求进入和真实 settle、credentials await 后取消、receipt HTTP 失败不伪装成功、keepalive 拒绝旁路。
- 相关现有 runtime/provider/Conversation tests；Communication artifact build 验证跨包接线。
- Client 文档记录 Web 实际 commit、测试命令与结果。可信 IPC 和双端 handoff 留给 C3-1c/C3-2，不由本节点测试推导完成。

## 实际结果

已完成 C3-1b 的 Web 侧真实 owner drain 基础，提交拆分如下：

- `b15bae55`：owner admission、read attention deny barrier 与 operation registry。
- `97344d54`：消息/会话 HTTP 在 axios dispatch 前登记，旧 session/Space 结果拒绝发布。
- `f841c85f`：unload read keepalive 纳入 owner ticket，并捕获 Space header。
- `cbd63532`：denied owner capture 不因后续 grant 重新生效。
- `c3e399a6`：转发、picker、composer、RichText 上传后的迟到回调隔离。
- `4ee55824`：reaction/search message HTTP 进入 drain 分类。
- `5107fdf5`：Communication owner kernel 在首次 startup 前安装，revoke 同步生效，stop 使用异步 drain endpoint。
- `e631f28a`：runtime channel info provider 的真实 Promise 纳入 drain。
- `67a78f05`：subscriber cache 的旧 account/Space continuation 拒绝发布。
- `581be948`、`a221865e`、`add9f2db`：history request、错误矩阵与 deferred viewport guard；错误矩阵保持独立提交。
- `b0042b9c`：ConversationList mark-read 及 reminder continuation 绑定 owner/context/lifecycle。
- `3dd1a9d2`、`183e8fd1`：上传真实 GET/PUT settle、取消/重试与 managed receipt failure 语义。
- `e9ad1ffd`：真实 WuKong SDK 1.3.5 lifecycle、ACK/unknown、timer/queue、native socket close、inbound fan-out guards。

本轮 focused 验证：

- Communication owner/SDK/context：7 files / 64 tests passed。
- base owner/channel runtime：3 files / 46 tests passed。
- datasource callback/upload/receipt：5 files / 49 tests passed。
- 真实 SDK loopback：1 integration test passed；严格 TypeScript 对本轮 runtime 文件无新增诊断。

Communication 的 production composition 已在 `index.tsx` 的 mocks 之后、首次 `WKApp.shared.startup` 之前安装 owner adapter，并将 session/Space revision callback 接入 APIClient；startup 失败会同步 revoke 并观察 stop。仍未实现 C3-1c 可信 IPC capability、C3-2 双端 authority handoff、confirmed cache 或 Renderer/UI 迁移；当前默认仍是 Web owner，adapter 只提供可验证的 drain 能力。
