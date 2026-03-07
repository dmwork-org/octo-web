import React, { Component } from "react";
import { IconPlus } from "@douyinfe/semi-icons";
import { Spin, Modal, Input, Toast } from "@douyinfe/semi-ui";
import { Space, SpaceService } from "../../Service/SpaceService";
import "./index.css";

export interface SpaceListProps {
    selectedSpaceId?: string;
    onSelect: (space: Space | undefined) => void;
    onCreateClick: () => void;
}

interface SpaceListState {
    spaces: Space[];
    loading: boolean;
    showJoinModal: boolean;
    joinCode: string;
    joining: boolean;
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
        } catch {
            Toast.error("加入失败，请检查邀请码");
            this.setState({ joining: false });
        }
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
        const { selectedSpaceId, onSelect, onCreateClick } = this.props;
        const { spaces, loading } = this.state;

        const { showJoinModal, joinCode, joining } = this.state;

        return (
            <div className="wk-spacelist">
                <div className="wk-spacelist-header">
                    <span className="wk-spacelist-title">Space</span>
                    <div className="wk-spacelist-header-actions">
                        <div className="wk-spacelist-add" onClick={() => this.setState({ showJoinModal: true })} title="加入 Space">
                            <span style={{ fontSize: '12px' }}>加入</span>
                        </div>
                        <div className="wk-spacelist-add" onClick={onCreateClick} title="创建 Space">
                            <IconPlus size="small" />
                        </div>
                    </div>
                </div>
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
                {loading ? (
                    <div className="wk-spacelist-loading">
                        <Spin size="small" />
                    </div>
                ) : (
                    <div className="wk-spacelist-items">
                        <div
                            className={`wk-spacelist-item ${!selectedSpaceId ? "wk-spacelist-item-selected" : ""}`}
                            onClick={() => onSelect(undefined)}
                        >
                            <div className="wk-spacelist-item-avatar">
                                <div className="wk-spacelist-item-avatar-letter wk-spacelist-all-icon">
                                    All
                                </div>
                            </div>
                            <div className="wk-spacelist-item-info">
                                <div className="wk-spacelist-item-name">全部会话</div>
                            </div>
                        </div>
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
                                    <div className="wk-spacelist-item-count">{space.member_count} 人</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}
