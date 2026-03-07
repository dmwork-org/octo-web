import React, { Component } from "react";
import { WKApp } from "@octo/base";
import { SpaceService } from "@octo/base/src/Service/SpaceService";
import { Input, Button, Toast, Spin } from "@douyinfe/semi-ui";

interface SpaceGateState {
    loading: boolean;
    noSpace: boolean;
    inviteCode: string;
    joining: boolean;
}

export default class SpaceGate extends Component<{}, SpaceGateState> {
    state: SpaceGateState = {
        loading: true,
        noSpace: false,
        inviteCode: "",
        joining: false,
    };

    componentDidMount() {
        // 先检查 localStorage 缓存
        const cached = localStorage.getItem("currentSpaceId");
        if (cached) {
            this.enterSpace(cached);
            return;
        }
        this.checkSpaces();
    }

    enterSpace = (spaceId: string) => {
        WKApp.shared.currentSpaceId = spaceId;
        WKApp.shared.spaceChecked = true;
        localStorage.setItem("currentSpaceId", spaceId);
        // 双保险：notifyListener + forceUpdate + 延迟 reload
        try {
            WKApp.shared.notifyListener();
        } catch (_) {}
        this.forceUpdate();
        // 如果 notifyListener 没生效，300ms 后 reload
        setTimeout(() => {
            if (document.querySelector(".wk-spacegate-join")) {
                window.location.reload();
            }
        }, 300);
    };

    checkSpaces = async () => {
        try {
            const spaces = await SpaceService.shared.getMySpaces();
            if (spaces.length >= 1) {
                this.enterSpace(spaces[0].space_id);
            } else {
                this.setState({ loading: false, noSpace: true });
            }
        } catch {
            this.setState({ loading: false, noSpace: true });
        }
    };

    joinSpace = async () => {
        const { inviteCode } = this.state;
        if (!inviteCode.trim()) {
            Toast.warning("请输入邀请码");
            return;
        }
        this.setState({ joining: true });
        try {
            await SpaceService.shared.joinSpace(inviteCode.trim());
            Toast.success("已加入 Space");
            this.checkSpaces();
        } catch {
            Toast.error("邀请码无效或已过期");
            this.setState({ joining: false });
        }
    };

    render() {
        const { loading, noSpace, inviteCode, joining } = this.state;

        if (loading && !noSpace) {
            return (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                    <Spin size="large" />
                </div>
            );
        }

        return (
            <div className="wk-spacegate-join" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "16px" }}>
                <h2>加入 Space</h2>
                <p style={{ color: "#888" }}>请输入邀请码加入一个 Space 开始使用</p>
                <Input
                    placeholder="邀请码"
                    value={inviteCode}
                    onChange={(v) => this.setState({ inviteCode: v })}
                    onEnterPress={this.joinSpace}
                    style={{ width: 300 }}
                />
                <Button theme="solid" type="primary" loading={joining} onClick={this.joinSpace} style={{ width: 300 }}>
                    加入
                </Button>
            </div>
        );
    }
}
