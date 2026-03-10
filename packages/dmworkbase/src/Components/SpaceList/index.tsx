import React, { Component } from "react";
import { IconPlus, IconSearch, IconLink, IconSetting } from "@douyinfe/semi-icons";
import { Spin, Modal, Input, Toast, Tooltip } from "@douyinfe/semi-ui";
import { Space, SpaceService } from "../../Service/SpaceService";
import "./index.css";

export interface SpaceListProps {
    selectedSpaceId?: string;
    onSelect: (space: Space | undefined) => void;
    onCreateClick: () => void;
    onSettingsClick?: (space: Space) => void;
}

interface SpaceListState {
    spaces: Space[];
    loading: boolean;
    showJoinModal: boolean;
    joinCode: string;
    joining: boolean;
    inviteLoading: string; // space_id being invited
    inviteCode: string;
    showInviteModal: boolean;
    inviteSpaceName: string;
}

export default class SpaceList extends Component<SpaceListProps, SpaceListState> {
    constructor(props: SpaceListProps) {
        super(props);
        this.state = {
            spaces: [],
            loading: false,
            showJoinModal: false,
            joinCode: "",
            joining: false,
            inviteLoading: "",
            inviteCode: "",
            showInviteModal: false,
            inviteSpaceName: "",
        };
    }

    componentDidMount() {
        this.loadSpaces();
    }

    loadSpaces = async () => {
        this.setState({ loading: true });
        try {
            const spaces = await SpaceService.shared.getMySpaces();
            this.setState({ spaces, loading: false });
            // 只有一个 Space 时自动选中
            if (spaces.length === 1 && !this.props.selectedSpaceId) {
                this.props.onSelect(spaces[0]);
            }
        } catch {
            this.setState({ loading: false });
        }
    };

    handleJoin = async () => {
        const { joinCode } = this.state;
        if (!joinCode.trim()) {
            Toast.warning("请输入邀请码");
            return;
        }
        this.setState({ joining: true });
        try {
            await SpaceService.shared.joinSpace(joinCode.trim());
            Toast.success("已加入 Space");
            this.setState({ showJoinModal: false, joinCode: "", joining: false });
            this.loadSpaces();
        } catch (e: any) {
            const msg = e?.msg || e?.message || "";
            if (msg.includes("已满") || msg.includes("SPACE_FULL")) {
                Toast.error("空间已满，无法加入");
            } else {
                Toast.error("加入失败，请检查邀请码");
            }
            this.setState({ joining: false });
        }
    };

    handleInvite = async (space: Space, e: React.MouseEvent) => {
        e.stopPropagation();
        this.setState({ inviteLoading: space.space_id });
        try {
            const resp = await SpaceService.shared.createInvite(space.space_id);
            this.setState({
                inviteCode: resp.invite_code,
                showInviteModal: true,
                inviteSpaceName: space.name,
                inviteLoading: "",
            });
        } catch {
            Toast.error("生成邀请链接失败");
            this.setState({ inviteLoading: "" });
        }
    };

    copyInviteCode = () => {
        navigator.clipboard.writeText(this.state.inviteCode).then(() => {
            Toast.success("邀请码已复制");
        });
    };

    copyInviteLink = () => {
        const link = `${window.location.origin}/join/${this.state.inviteCode}`;
        navigator.clipboard.writeText(link).then(() => {
            Toast.success("邀请链接已复制");
        });
    };

    renderSpaceAvatar(space: Space) {
        if (space.logo) {
            return <img className="wk-spacelist-item-avatar-img" alt="" src={space.logo} />;
        }
        const colors = ["#667eea", "#764ba2", "#f093fb", "#4facfe", "#43e97b", "#fa709a", "#fee140", "#a18cd1"];
        const colorIndex = space.name.charCodeAt(0) % colors.length;
        return (
            <div className="wk-spacelist-item-avatar-letter" style={{ backgroundColor: colors[colorIndex] }}>
                {space.name.charAt(0).toUpperCase()}
            </div>
        );
    }

    render() {
        const { selectedSpaceId, onSelect, onCreateClick, onSettingsClick } = this.props;
        const { spaces, loading, showJoinModal, joinCode, joining,
                showInviteModal, inviteCode, inviteSpaceName, inviteLoading } = this.state;

        const selectedSpace = spaces.find(s => s.space_id === selectedSpaceId);
        const headerLabel = selectedSpace ? selectedSpace.name : "Space";

        return (
            <div className="wk-spacelist">
                <div className="wk-spacelist-header">
                    <span className="wk-spacelist-title" title={headerLabel}>{headerLabel}</span>
                    <div className="wk-spacelist-header-actions">
                        <Tooltip content="加入空间" position="bottom">
                            <div className="wk-spacelist-action-btn" onClick={() => this.setState({ showJoinModal: true })}>
                                <IconSearch size="small" />
                            </div>
                        </Tooltip>
                        <Tooltip content="创建空间" position="bottom">
                            <div className="wk-spacelist-action-btn" onClick={onCreateClick}>
                                <IconPlus size="small" />
                            </div>
                        </Tooltip>
                    </div>
                </div>

                {/* Join Modal */}
                <Modal
                    title="加入 Space"
                    visible={showJoinModal}
                    onOk={this.handleJoin}
                    onCancel={() => this.setState({ showJoinModal: false, joinCode: "" })}
                    okText={joining ? "加入中..." : "加入"}
                    confirmLoading={joining}
                >
                    <Input
                        placeholder="输入邀请码"
                        value={joinCode}
                        onChange={(v) => this.setState({ joinCode: v })}
                        onEnterPress={this.handleJoin}
                    />
                </Modal>

                {/* Invite Result Modal */}
                <Modal
                    title={`邀请加入「${inviteSpaceName}」`}
                    visible={showInviteModal}
                    footer={null}
                    onCancel={() => this.setState({ showInviteModal: false, inviteCode: "" })}
                >
                    <div className="wk-spacelist-invite-modal">
                        <div className="wk-spacelist-invite-row">
                            <span className="wk-spacelist-invite-label">邀请码</span>
                            <code className="wk-spacelist-invite-code">{inviteCode}</code>
                            <button className="wk-spacelist-invite-btn" onClick={this.copyInviteCode}>复制</button>
                        </div>
                        <button className="wk-spacelist-invite-btn wk-spacelist-invite-btn-full" onClick={this.copyInviteLink}>
                            📋 复制邀请链接
                        </button>
                    </div>
                </Modal>

                {loading ? (
                    <div className="wk-spacelist-loading">
                        <Spin size="small" />
                    </div>
                ) : (
                    <div className="wk-spacelist-items">
                        {/* 移除"全部会话" — Space 模式下所有会话都在 Space 内 */}
                        {spaces.map((space) => (
                            <div
                                key={space.space_id}
                                className={`wk-spacelist-item ${selectedSpaceId === space.space_id ? "wk-spacelist-item-selected" : ""}`}
                                onClick={() => onSelect(space)}
                            >
                                <div className="wk-spacelist-item-avatar">
                                    {this.renderSpaceAvatar(space)}
                                </div>
                                <div className="wk-spacelist-item-info">
                                    <div className="wk-spacelist-item-name">{space.name}</div>
                                    <div className="wk-spacelist-item-count">
                                        {space.max_users > 0 ? `${space.member_count}/${space.max_users} 人` : `${space.member_count} 人`}
                                    </div>
                                </div>
                                <div className="wk-spacelist-item-actions">
                                    <Tooltip content="邀请成员" position="right">
                                        <div
                                            className="wk-spacelist-item-action"
                                            onClick={(e) => this.handleInvite(space, e)}
                                        >
                                            {inviteLoading === space.space_id ? <Spin size="small" /> : <IconLink size="small" />}
                                        </div>
                                    </Tooltip>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}
