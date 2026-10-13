# Communication owner endpoint 实施边界

本节点对应 Client `docs/im-owner-drain-and-cutover-design.md` 的 C3-1c，依赖已完成的 Web admission 与真实 SDK drain。默认仍由 Web 提供消息能力。本节点产出可信宿主端点，不开启实际 Web→Client 切换。

## 行为清单

- 不增加用户入口；Main 可通过独立协议发出 quiesce、prepare、grant、revoke。
- quiesce 只有在在途操作结束、SDK 队列清理、物理 socket CLOSED、read attention 保持禁止后才报告 drained。
- prepare 仅准备资源；grant 必须关联同代、一次性 prepareRequestId，才允许恢复 Web owner。
- revoke 同步禁止新副作用；revoked 仅证明 admission/read 撤销，不证明 drain。
- requestId、bindingId、runtime scope、generation 必须匹配；旧、重复和迟到命令不能重新激活。
- 账号、token、API origin、Space 或 runtime incarnation 改变后，旧端点报告不再有效。已接受的异步操作保留其原始代次，失败后禁止并清理部分资源。
- grant 报告失败或被宿主拒绝时，Web 同步撤销 admission 并观察清理；未确认 ACK 的发送保持 unknown，不自动重发。

## 文件地图

- `apps/web/src/client-feature/imOwnerCutoverContract.ts`：Client wire contract 的 Web 副本，严格输入校验。
- `apps/web/src/client-communication/runtime/messageOwnerEndpoint.ts`：命令关联、一次性准备、激活与失败撤销。
- `runtime/messageOwner.ts` 与 `packages/dmworkbase/src/im-runtime/ownerAdmission.ts`：允许同一个正代次安全撤销 preparing/active；prepare 仍要求新代次。
- `runtime/start.ts`：在 ready report 和数据 runtime 启动前安装端点，集中处理清理。
- `hostBridge.ts`、`bootstrapContract.ts`：可选能力与当前 runtime 身份校验。
- `scripts/build-client-communication.mjs`、`client-feature-build.mjs`：验收后声明独立 `ownerCutoverVersion=1`。
- endpoint、bootstrap、composition 单测：协议错误、取消、重放、迟到和上下文失效。

## 提交范围

主线为 C3-1c endpoint 与 capability 接线，影响嵌入 Communication 的 lifecycle 和共享 admission kernel。普通 Web 的初始 generation=0 行为保持；同代撤销仅允许正代次。完整双端协调、Client 业务能力迁移、持久化缓存和 UI 在后续节点交付。

## 验证计划

1. Web endpoint/bootstrap/composition 契约测试，验证 grant/revoke/replay/late completion 与缺失宿主能力。
2. 共享 admission、message owner、SDK mutations 与真实 SDK loopback 回归。
3. Client contract/endpoint/IPC/manager/preload/artifact 单测与 IM 全套、typecheck。
4. 独立 Electron gate 使用真实 IPC、Communication preload、Web SDK owner 与 loopback；证明 socket drain 和显式恢复。
5. 干净源码构建 Communication artifact，检查实际提交、sourceDirty=false 和 ownerCutoverVersion=1。制品验证不能代替双端 authority handoff。
