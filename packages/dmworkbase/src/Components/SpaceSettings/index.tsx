import React, { Component } from "react";
import { Input, TextArea, Toast, Modal, Button } from "@douyinfe/semi-ui";
import { IconCopy, IconLink } from "@douyinfe/semi-icons";
import { Space, SpaceService } from "../../Service/SpaceService";
import "./index.css";

export interface SpaceSettingsProps {
    space: Space;
    onClose: () => void;
    onMembersClick: () => void;
    onSpaceUpdated: () => void;
}

interface SpaceSettingsState {
    name: string;
    description: string;
    saving: boolean;
    inviteCode: string;
    inviteLoading: boolean;
}

export default class SpaceSettings extends Component<SpaceSettingsProps, SpaceSettingsState> {
    constructor(props: SpaceSettingsProps) {
        super(props);
        this.state = {
            name: props.space.name,
            description: props.space.description || "",
            saving: false,
            inviteCode: "",
            inviteLoading: false,
        };
    }

    handleSave = async () => {
        const { name, description } = this.state;
        if (!name.trim()) {
            Toast.warning("名称不能为空");
            return;
        }
        this.setState({ saving: true });
        try {
            await SpaceService.shared.updateSpace(this.props.space.space_id, {
                name: name.trim(),
                description: description.trim(),
            });
            Toast.success("已保存");
            this.props.onSpaceUpdated();
        } catch {
            Toast.error("保存失败");
        } finally {
            this.setState({ saving: false });
        }
    };

    handleLeave = () => {
        Modal.confirm({
            title: "离开 Space",
            content: "确定要离开此 Space 吗？",
            onOk: async () => {
                try {
                    await SpaceService.shared.leaveSpace(this.props.space.space_id);
                    Toast.success("已离开 Space");
                    this.props.onSpaceUpdated();
                    this.props.onClose();
                } catch {
                    Toast.error("操作失败");
                }
            },
        });
    };

    handleDisband = () => {
        Modal.confirm({
            title: "解散 Space",
            content: "解散后无法恢复，确定要解散吗？",
            okType: "danger",
            onOk: async () => {
                try {
                    await SpaceService.shared.disbandSpace(this.props.space.space_id);
                    Toast.success("Space 已解散");
                    this.props.onSpaceUpdated();
                    this.props.onClose();
                } catch {
                    Toast.error("操作失败");
                }
            },
        });
    };

    handleInvite = async () => {
        this.setState({ inviteLoading: true });
        try {
            const resp = await SpaceService.shared.createInvite(this.props.space.space_id);
            this.setState({ inviteCode: resp.invite_code, inviteLoading: false });
        } catch {
            Toast.error("生成邀请链接失败");
            this.setState({ inviteLoading: false });
        }
    };

    copyInviteCode = () => {
        const { inviteCode } = this.state;
        navigator.clipboard.writeText(inviteCode).then(() => {
            Toast.success("邀请码已复制");
        });
    };

    copyInviteLink = () => {
        const { inviteCode } = this.state;
        const link = `${window.location.origin}/join/${inviteCode}`;
        navigator.clipboard.writeText(link).then(() => {
            Toast.success("邀请链接已复制");
        });
    };

    isOwner() {
        return this.props.space.role === 1;
    }

    isAdmin() {
        return this.props.space.role === 1 || this.props.space.role === 2;
    }

    render() {
        const { onClose, onMembersClick } = this.props;
        const { name, description, saving } = this.state;
        const isOwner = this.isOwner();

        return (
            <div className="wk-spacesettings">
                <div className="wk-spacesettings-header">
                    <div className="wk-spacesettings-back" onClick={onClose}>
                        ←
                    </div>
                    <span className="wk-spacesettings-title">Space 设置</span>
                </div>
                <div className="wk-spacesettings-body">
                    <div className="wk-spacesettings-field">
                        <label className="wk-spacesettings-label">名称</label>
                        <Input
                            value={name}
                            onChange={(v) => this.setState({ name: v })}
                            maxLength={32}
                            disabled={!isOwner}
                        />
                    </div>
                    <div className="wk-spacesettings-field">
                        <label className="wk-spacesettings-label">描述</label>
                        <TextArea
                            value={description}
                            onChange={(v) => this.setState({ description: v })}
                            maxCount={200}
                            autosize={{ minRows: 3, maxRows: 5 }}
                            disabled={!isOwner}
                        />
                    </div>
                    {isOwner && (
                        <button
                            className="wk-spacesettings-btn wk-spacesettings-btn-primary"
                            onClick={this.handleSave}
                            disabled={saving}
                        >
                            {saving ? "保存中..." : "保存修改"}
                        </button>
                    )}

                    {this.isAdmin() && (
                        <div className="wk-spacesettings-section">
                            <label className="wk-spacesettings-label">邀请成员</label>
                            {!this.state.inviteCode ? (
                                <button
                                    className="wk-spacesettings-btn wk-spacesettings-btn-primary"
                                    onClick={this.handleInvite}
                                    disabled={this.state.inviteLoading}
                                >
                                    {this.state.inviteLoading ? "生成中..." : "生成邀请链接"}
                                </button>
                            ) : (
                                <div className="wk-spacesettings-invite-result">
                                    <div className="wk-spacesettings-invite-row">
                                        <span className="wk-spacesettings-invite-label">邀请码：</span>
                                        <code className="wk-spacesettings-invite-code">{this.state.inviteCode}</code>
                                        <button className="wk-spacesettings-copy-btn" onClick={this.copyInviteCode}>复制</button>
                                    </div>
                                    <div className="wk-spacesettings-invite-row">
                                        <button className="wk-spacesettings-copy-btn wk-spacesettings-copy-link" onClick={this.copyInviteLink}>
                                            复制邀请链接
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="wk-spacesettings-section">
                        <div className="wk-spacesettings-menu-item" onClick={onMembersClick}>
                            <span>成员管理</span>
                            <span className="wk-spacesettings-arrow">→</span>
                        </div>
                    </div>

                    <div className="wk-spacesettings-danger-zone">
                        <button
                            className="wk-spacesettings-btn wk-spacesettings-btn-warning"
                            onClick={this.handleLeave}
                        >
                            离开 Space
                        </button>
                        {isOwner && (
                            <button
                                className="wk-spacesettings-btn wk-spacesettings-btn-danger"
                                onClick={this.handleDisband}
                            >
                                解散 Space
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}
