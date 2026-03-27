import { WKApp, WKLayout, Provider } from "@octo/base";
import React, { Component } from "react";
import "./index.css"
import MainVM from "./vm";
import { EmptyStateIllustration } from "./EmptyStateIllustration";
import { TabNormalScreen } from "./tab_normal_screen";
import { Space, SpaceService } from "@octo/base";
import { SpaceCreate, ConnectionStatus, JoinSpaceModal, ActionListItem, SpaceItem, WKButton } from "@octo/base";
import { useJoinSpace } from "@octo/base";
import { Toast } from "@douyinfe/semi-ui";
import { IconSearch, IconPlus, IconLink } from "@douyinfe/semi-icons";
import classNames from "classnames";

/** hook 包装组件，供 Class 组件内使用 */
function InternalJoinModal({ visible, onClose, onSuccess }: {
    visible: boolean;
    onClose: () => void;
    onSuccess: (spaceId: string) => void;
}) {
    const joinProps = useJoinSpace({ onClose, onSuccess });
    return <JoinSpaceModal visible={visible} {...joinProps} />;
}


export interface MainContentLeftProps {
    vm: MainVM
}

export interface MainContentLeftState {
}
interface MainContentLeftFullState {
    allSpaces: Space[];
    showSpaceDropdown: boolean;
    showSpaceCreate: boolean;
    showJoinSpace: boolean;
}

export class MainContentLeft extends Component<MainContentLeftProps, MainContentLeftFullState>{
    constructor(props: any) {
        super(props)
        this.state = {
            allSpaces: [],
            showSpaceDropdown: false,
            showSpaceCreate: false,
            showJoinSpace: false,
        }
    }

    handleCopyInviteLink = async (spaceId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const detail = await WKApp.apiClient.get(`/space/${spaceId}`);
            if (!detail.invite_code) { Toast.warning("该 Space 暂无邀请码"); return; }
            const link = `${window.location.origin}${window.location.pathname}?invite=${detail.invite_code}`;
            let copied = false;
            try {
                await navigator.clipboard.writeText(link);
                copied = true;
            } catch {
                const textarea = document.createElement("textarea");
                textarea.value = link;
                textarea.style.cssText = "position:fixed;opacity:0";
                document.body.appendChild(textarea);
                textarea.select();
                copied = document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            copied ? Toast.success("邀请链接已复制") : Toast.error("复制失败，请手动复制");
        } catch {
            Toast.error("获取邀请码失败");
        }
    };

    componentDidMount() {
        SpaceService.shared.getMySpaces().then(spaces => {
            this.setState({ allSpaces: spaces });
            // 恢复上次选中的 Space，或默认第一个
            const savedSpaceId = localStorage.getItem("currentSpaceId")
            if (savedSpaceId && spaces.find(s => s.space_id === savedSpaceId)) {
                WKApp.shared.currentSpaceId = savedSpaceId
            } else if (spaces.length > 0) {
                // savedSpaceId 不在列表中或 currentSpaceId 为空，fallback 到第一个
                WKApp.shared.currentSpaceId = spaces[0].space_id
                localStorage.setItem("currentSpaceId", spaces[0].space_id)
                this.forceUpdate()
            } else {
                // 无 Space：清除状态，回到 SpaceGate 引导页
                WKApp.shared.currentSpaceId = ''
                WKApp.shared.spaceChecked = false
                localStorage.removeItem("currentSpaceId")
                try { WKApp.shared.notifyListener(); } catch (_) {}
            }
        }).catch(() => {});
    }

    render() {
        const { vm } = this.props
        const { allSpaces, showSpaceDropdown } = this.state;
        const currentSpaceId = WKApp.shared.currentSpaceId;
        const currentSpace = allSpaces.find(s => s.space_id === currentSpaceId);
        const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

        return <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', borderRight: '1px solid var(--wk-border-default)' }}>
            {/* 全局顶栏 */}
            <div className="wk-global-topbar">
                <div className="wk-global-topbar-space" style={{ position: 'relative' }}
                    onClick={() => this.setState(prev => ({ showSpaceDropdown: !prev.showSpaceDropdown }))}>
                    {currentSpace && (
                        <>
                            <span className="wk-global-topbar-space-icon" style={{
                                backgroundColor: colors[currentSpace.name.charCodeAt(0) % colors.length]
                            }}>{currentSpace.name.charAt(0)}</span>
                            <span className="wk-global-topbar-space-name">{currentSpace.name}</span>
                            <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>▾</span>
                        </>
                    )}
                    {showSpaceDropdown && (
                        <div className="wk-global-topbar-dropdown" onClick={e => e.stopPropagation()}>
                            {allSpaces.map(space => (
                                <SpaceItem
                                    key={space.space_id}
                                    name={space.name}
                                    logo={space.logo}
                                    meta={space.max_users > 0
                                        ? `${space.member_count}/${space.max_users} 人`
                                        : `${space.member_count} 人`}
                                    selected={space.space_id === currentSpaceId}
                                    onClick={() => {
                                        WKApp.shared.currentSpaceId = space.space_id;
                                        localStorage.setItem("currentSpaceId", space.space_id);
                                        WKApp.shared.notifyListener();
                                        WKApp.mittBus.emit("space-changed", space);
                                        this.setState({ showSpaceDropdown: false });
                                    }}
                                    actions={
                                        <WKButton
                                            variant="ghost"
                                            size="sm"
                                            iconOnly
                                            icon={<IconLink />}
                                            title="复制邀请链接"
                                            onClick={(e) => this.handleCopyInviteLink(space.space_id, e)}
                                        />
                                    }
                                />
                            ))}
                            <div className="wk-global-topbar-dropdown-divider"></div>
                            <ActionListItem
                                icon={<IconSearch />}
                                label="加入 Space"
                                desc="通过邀请码或链接加入"
                                variant="join"
                                onClick={() => this.setState({ showSpaceDropdown: false, showJoinSpace: true })}
                            />
                            <ActionListItem
                                icon={<IconPlus />}
                                label="创建 Space"
                                desc="新建你自己的工作空间"
                                variant="create"
                                onClick={() => this.setState({ showSpaceDropdown: false, showSpaceCreate: true })}
                            />
                        </div>
                    )}
                </div>
                <ConnectionStatus />
            </div>
            {/* 路由内容 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {vm.historyRoutePaths.map((routePath, i) => {
                    const Cpt = WKApp.route.get(routePath)
                    return <div key={i} style={{ "display": routePath === vm.currentMenus?.routePath ? "block" : "none", "width": "100%", "height": "100%" }}>
                        {React.isValidElement(Cpt) ? Cpt : undefined}
                    </div>
                })}
            </div>
            <SpaceCreate
                visible={this.state.showSpaceCreate}
                onClose={() => {
                    this.setState({ showSpaceCreate: false });
                }}
                onSuccess={() => {
                    this.setState({ showSpaceCreate: false });
                    SpaceService.shared.getMySpaces().then(spaces => {
                        this.setState({ allSpaces: spaces });
                    }).catch(() => {});
                }}
            />
            <InternalJoinModal
                visible={this.state.showJoinSpace}
                onClose={() => this.setState({ showJoinSpace: false })}
                onSuccess={(spaceId) => {
                    SpaceService.shared.getMySpaces().then(spaces => {
                        this.setState({ allSpaces: spaces, showJoinSpace: false });
                        // 切换到新加入的 Space
                        WKApp.shared.currentSpaceId = spaceId;
                        localStorage.setItem("currentSpaceId", spaceId);
                        WKApp.mittBus.emit("space-changed", spaces.find(s => s.space_id === spaceId));
                        WKApp.shared.notifyListener();
                    }).catch(() => {});
                }}
            />
        </div>
    }
}

export class MainPage extends Component {

    render() {
        return <Provider create={() => {
            return new MainVM()
        }} render={(vm: MainVM) => {
            return <WKLayout onRenderTab={(size) => {
                // if (size === ScreenSize.small) {
                //     return <TabLowScreen vm={vm}></TabLowScreen>
                // }
                return <TabNormalScreen vm={vm} />
            }} contentLeft={<MainContentLeft vm={vm} />} onRightContext={(context) => {
                WKApp.routeRight.setPush = (view) => {
                    context.push(view)
                }
                WKApp.routeRight.setReplaceToRoot = (view) => {
                    context.replaceToRoot(view)
                }
                WKApp.routeRight.setPop = () => {
                    context.pop()
                }
                WKApp.routeRight.setPopToRoot = () => {
                    context.popToRoot()
                }
            }} onLeftContext={(context) => {
                WKApp.routeLeft.setPush = (view) => {
                    context.push(view)
                }
                WKApp.routeLeft.setReplaceToRoot = (view) => {
                    context.replaceToRoot(view)
                }
                WKApp.routeLeft.setPop = () => {
                    context.pop()
                }
                WKApp.routeLeft.setPopToRoot = () => {
                    context.popToRoot()
                }
            }} contentRight={<EmptyStateIllustration />} />
        }}>

        </Provider>
    }
}