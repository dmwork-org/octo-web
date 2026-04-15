import React, { Component } from "react";
import { WKApp, WKBase, Provider, ErrorBoundary } from "@octo/base"
import { listen } from '@tauri-apps/api/event'
import { MainPage } from "../Pages/Main";
import SpaceGate from "../Components/SpaceGate";
import { Notification as NotificationUI, Button } from '@douyinfe/semi-ui';
import { checkUpdate, installUpdate, UpdateManifest } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'
import { os } from "@tauri-apps/api";
import { getSid, getQueryParam } from "@octo/base";
import type { JoinApprovalStatus } from "@octo/base";
import { toJoinApprovalStatus } from "@octo/base";
import InviteLanding from "../Components/InviteLanding";
import JoinSpacePage from "../Components/JoinSpacePage";
import JoinApprovalResult from "../Components/JoinApprovalResult";

interface AppLayoutState {
    showJoinSpace: boolean;
    joinApproval?: { status: JoinApprovalStatus; inviteCode: string };
}

export default class AppLayout extends Component<{}, AppLayoutState> {
    state: AppLayoutState = { showJoinSpace: false };

    onLogin!: () => void
    onNeedJoinSpace!: () => void
    onJoinApproval!: (status: JoinApprovalStatus, inviteCode: string) => void
    private _spaceChecked = false; // 冷启动 Space 检测只跑一次

    componentDidMount() {
        // Wave 2: 无 Space 时触发 JoinSpacePage 覆盖层
        this.onNeedJoinSpace = () => {
            this.setState({ showJoinSpace: true });
        };
        WKApp.endpoints.addOnNeedJoinSpace(this.onNeedJoinSpace);

        // 审批结果统一渲染：任何入口 join 返回 NEED_APPROVAL/PENDING 都走这里
        this.onJoinApproval = (status, inviteCode) => {
            this.setState({ joinApproval: { status, inviteCode } });
        };
        WKApp.endpoints.addOnJoinApproval(this.onJoinApproval);

        // T5: 冷启动已登录检测 — 用户直接打开 App 恢复登录态时，检查是否有 Space
        if (WKApp.shared.isLogined()) {
            this.checkSpaceOnColdStart();
        }

        this.onLogin = () => {
            try { Notification.requestPermission() } catch(_) {} // 请求通知权限（iOS 不支持，忽略错误）
            const basePath = (window.location.pathname.replace(/\/login\/?$/, '').replace(/\/index\.html$/, '') || '/').replace(/\/+$/, '')
            // 保留原始 sid（如果有），不随机生成新的
            const existingSid = getQueryParam("sid") || ""
            const sidParam = existingSid ? `?sid=${existingSid}` : ""

            const goMain = () => {
                if ((window as any).__POWERED_EXTENSION__) {
                    window.location.reload()
                    return
                }
                window.location.href = `${window.location.origin}${basePath}/${sidParam}`
            }

            // 检查是否有待处理的邀请码（验证格式防止 XSS/Open Redirect）
            const pendingInvite = localStorage.getItem("pendingInviteCode");
            if (pendingInvite && /^[a-zA-Z0-9_-]+$/.test(pendingInvite)) {
                WKApp.apiClient.post(`/space/join`, { invite_code: pendingInvite })
                    .then((result: any) => {
                        // 成功路径才删 pendingInviteCode
                        localStorage.removeItem("pendingInviteCode");
                        const status = result?.status;
                        if (status === "NEED_APPROVAL" || status === "PENDING") {
                            // 审批状态：统一走全局钩子，Layout state 渲染审批结果页
                            WKApp.endpoints.onJoinApproval(
                                toJoinApprovalStatus(status),
                                pendingInvite
                            );
                            return;
                        }
                        const spaceId = result?.space_id;
                        if (spaceId) localStorage.setItem('currentSpaceId', spaceId);
                        goMain();
                    })
                    .catch((e: any) => {
                        const msg = e?.msg || '';
                        if (msg.includes('已满') || msg.includes('SPACE_FULL')) {
                            // SPACE_FULL 保留 pendingInviteCode，让用户下次重试
                            import('@douyinfe/semi-ui').then(({ Toast }) => Toast.error('空间已满，无法加入'));
                        } else if (msg.includes('已是成员') || msg.includes('already')) {
                            localStorage.removeItem("pendingInviteCode");
                            if (e?.space_id) localStorage.setItem('currentSpaceId', e.space_id);
                        } else {
                            localStorage.removeItem("pendingInviteCode");
                            console.warn('Auto-join space failed:', msg);
                        }
                        goMain();
                    });
                return;
            }
            goMain()
        }
        WKApp.endpoints.addOnLogin(this.onLogin)

        this.tauriCheckUpdate()

    }

    componentWillUnmount() {
        WKApp.endpoints.removeOnLogin(this.onLogin);
        WKApp.endpoints.removeOnNeedJoinSpace(this.onNeedJoinSpace);
        WKApp.endpoints.removeOnJoinApproval(this.onJoinApproval);
    }

    /**
     * T5 — 冷启动 Space 检测
     * 用户直接打开 App（已有 token，不走 loginSuccess）时，检查是否有 Space。
     * - 有 Space → 不干预，正常走 SpaceGate / MainPage 原有逻辑
     * - 无 Space → 触发 onNeedJoinSpace() 显示 JoinSpacePage
     * 只执行一次，避免多次 render 重复触发。
     */
    private async checkSpaceOnColdStart() {
        if (this._spaceChecked) return;
        this._spaceChecked = true;

        try {
            const result = await WKApp.apiClient.get('space/my');
            const spaces = Array.isArray(result) ? result : (result?.data ?? []);
            if (spaces.length === 0) {
                WKApp.endpoints.onNeedJoinSpace();
            }
            // 有 Space：不干预，原有 SpaceGate 逻辑会继续处理
        } catch (e) {
            // 网络失败：静默降级，让原有流程继续
            console.warn('T5 space/my check failed, skipping:', e);
        }
    }

    async tauriCheckUpdate() {
        if(!(window as any).__TAURI_IPC__) {
            return
        }

        listen('tauri://update-status', function (res) {
        })

        try {
            const { shouldUpdate, manifest } = await checkUpdate()
            if (shouldUpdate) {
                // display dialog
                if(await os.platform() === "darwin") { // mac 自动下载更新
                    await installUpdate()
                }
                this.showUpdateUI(manifest)

            }
        } catch (error) {
            console.error('Update check failed:', error);
        }
    }

    showUpdateUI(manifest: UpdateManifest) {
      const notifyID =  NotificationUI.info({
            title: `有新版本 ${manifest.version}`,
            duration: 0,
            content: (
                <>
                    <div>{manifest.body}</div>
                    <div style={{ marginTop: 8 }}>
                        <Button onClick={ async () => {
                           // install complete, restart app
                           if(await os.platform() !== "darwin") {
                                await installUpdate()
                            }
                          await relaunch()
                        }}>更新</Button>
                        <Button onClick={()=>{
                            NotificationUI.close(notifyID)
                        }} type="secondary" style={{ marginLeft: 20 }}>
                            下次
                        </Button>
                    </div>
                </>
            ),
        })
    }

    showProgressUI() {

    }

    render() {
        const { joinApproval } = this.state;

        // 审批结果页：任何入口 join 返回 NEED_APPROVAL/PENDING 时，统一由 Layout state 渲染
        if (joinApproval) {
            return (
                <JoinApprovalResult
                    status={joinApproval.status}
                    onDismiss={() => this.setState({ joinApproval: undefined })}
                />
            );
        }

        // Wave 2: 无 Space 引导页（覆盖主界面）
        if (this.state.showJoinSpace) {
            return (
                <JoinSpacePage
                    onSuccess={() => {
                        this.setState({ showJoinSpace: false });
                        try {
                            WKApp.endpoints.callOnLogin();
                        } catch (e) {
                            console.warn("callOnLogin error suppressed:", e);
                        }
                    }}
                />
            );
        }

        // 邀请链接检测
        const urlParams = new URLSearchParams(window.location.search);
        const inviteCode = urlParams.get("invite");
        const action = urlParams.get("action");
        if (inviteCode && action !== "login") {
            // 确保登录信息已加载（邀请页在 Provider 之前渲染）
            if (!WKApp.loginInfo.token) {
                WKApp.loginInfo.load();
            }
            // 如果 URL 没有 ?sid= 或 sid 不匹配，尝试从 localStorage 找正确的 token
            if (!WKApp.loginInfo.token) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith("token") && key !== "token") {
                        const val = localStorage.getItem(key);
                        if (val) {
                            // 直接设置 token 和相关信息，不重定向
                            const sid = key.substring(5);
                            WKApp.loginInfo.token = val;
                            WKApp.loginInfo.uid = localStorage.getItem("uid" + sid) || "";
                            WKApp.loginInfo.name = localStorage.getItem("name" + sid) || "";
                            break;
                        }
                    }
                }
            }
            return <InviteLanding inviteCode={inviteCode} />;
        }

        return <Provider create={() => {
            return WKApp.shared
        }} render={(vm: WKApp): any => {
            if (!WKApp.shared.isLogined() || window.location.pathname.endsWith('/login')) {
                const loginComponent = WKApp.route.get("/login")
                if (!loginComponent) {
                    return <div>没有登录模块！</div>
                }
                return loginComponent
            }
            // Space 模式：检查用户是否属于至少一个 Space
            if (!WKApp.shared.currentSpaceId) {
                // 尝试从 localStorage 恢复
                const cached = localStorage.getItem("currentSpaceId");
                if (cached) {
                    WKApp.shared.currentSpaceId = cached;
                    WKApp.shared.spaceChecked = true;
                }
            }
            if (!WKApp.shared.currentSpaceId && !WKApp.shared.spaceChecked) {
                return <SpaceGate />
            }
            return <ErrorBoundary moduleName="应用">
                <WKBase onContext={(ctx) => {
                    WKApp.shared.baseContext = ctx
                }}>
                    <MainPage />
                </WKBase>
            </ErrorBoundary>
        }} />

    }
}