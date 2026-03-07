import React, { Component } from "react";
import { Modal, Button, Spin, Toast } from "@douyinfe/semi-ui";
import { Channel, ChannelTypePerson, WKSDK } from "wukongimjssdk";
import WKApp from "../../App";
import WKAvatar from "../WKAvatar";
import AiBadge from "../AiBadge";
import "./index.css";

interface BotDetailModalProps {
    uid: string;
    visible: boolean;
    onClose: () => void;
    onChat: (channel: Channel) => void;
}

interface BotDetailModalState {
    loading: boolean;
    name: string;
    username: string;
    description: string;
    creatorName: string;
    botCommands: string;
    isFriend: boolean;
    applying: boolean;
}

export default class BotDetailModal extends Component<BotDetailModalProps, BotDetailModalState> {
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    state: BotDetailModalState = {
        loading: true,
        name: "",
        username: "",
        description: "",
        creatorName: "",
        botCommands: "",
        isFriend: false,
        applying: false,
    };

    componentDidMount() {
        if (this.props.uid) this.loadBotInfo();
    }

    componentDidUpdate(prevProps: BotDetailModalProps) {
        if (prevProps.uid !== this.props.uid && this.props.uid) {
            this.loadBotInfo();
        }
    }

    componentWillUnmount() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    loadBotInfo = async () => {
        const { uid } = this.props;
        if (!uid) return;

        this.setState({ loading: true });
        try {
            // 用 user detail API 获取完整信息（包含 follow）
            const data = await WKApp.apiClient.get(`users/${uid}`);
            this.setState({
                loading: false,
                name: data.name || uid,
                username: data.username || uid,
                description: data.bot_description || "暂无简介",
                creatorName: data.bot_creator_name || "",
                botCommands: data.bot_commands || "",
                isFriend: data.follow === 1,
            });
        } catch {
            // fallback to channel info
            try {
                const channelInfo = await WKSDK.shared().channelManager.fetchChannelInfo(
                    new Channel(uid, ChannelTypePerson)
                );
                this.setState({
                    loading: false,
                    name: channelInfo?.title || uid,
                    username: uid,
                    description: channelInfo?.orgData?.bot_description || "暂无简介",
                    creatorName: channelInfo?.orgData?.bot_creator_name || "",
                    botCommands: channelInfo?.orgData?.bot_commands || "",
                    isFriend: channelInfo?.orgData?.follow === 1,
                });
            } catch {
                this.setState({ loading: false, name: uid });
            }
        }
    };

    handleChat = () => {
        const { uid, onChat, onClose } = this.props;
        const spaceId = WKApp.shared.currentSpaceId;
        const channelId = spaceId ? `s${spaceId}_${uid}` : uid;
        onChat(new Channel(channelId, ChannelTypePerson));
        onClose();
    };

    handleAddFriend = async () => {
        const { uid } = this.props;
        this.setState({ applying: true });
        try {
            await WKApp.apiClient.post("friend/apply", {
                body: { to_uid: uid, remark: "" },
            });
            Toast.success("好友申请已发送");
            // Bot auto_approve=1 时会自动通过，刷新状态
            this.refreshTimer = setTimeout(() => this.loadBotInfo(), 500);
        } catch {
            Toast.error("申请失败");
        } finally {
            this.setState({ applying: false });
        }
    };

    render() {
        const { visible, onClose, uid } = this.props;
        const { loading, name, username, description, creatorName, botCommands, isFriend, applying } = this.state;

        let commands: { cmd: string; remark: string }[] = [];
        try {
            if (botCommands) commands = JSON.parse(botCommands);
        } catch {}

        return (
            <Modal
                title={null}
                visible={visible}
                onCancel={onClose}
                footer={null}
                width={380}
                className="wk-bot-detail-modal"
            >
                {loading ? (
                    <div style={{ textAlign: "center", padding: 40 }}>
                        <Spin size="large" />
                    </div>
                ) : (
                    <div className="wk-bot-detail-content">
                        <div className="wk-bot-detail-header">
                            <WKAvatar channel={new Channel(uid, ChannelTypePerson)} size={64} />
                            <div className="wk-bot-detail-name">
                                {name} <AiBadge />
                            </div>
                            <div className="wk-bot-detail-id">@{username}</div>
                            {creatorName && (
                                <div className="wk-bot-detail-creator">
                                    由 {creatorName} 创建
                                </div>
                            )}
                        </div>
                        <div className="wk-bot-detail-desc">
                            <div className="wk-bot-detail-label">简介</div>
                            <div>{description}</div>
                        </div>
                        {commands.length > 0 && (
                            <div className="wk-bot-detail-commands">
                                <div className="wk-bot-detail-label">命令</div>
                                {commands.map((cmd, i) => (
                                    <div key={i} className="wk-bot-detail-cmd">
                                        <span className="wk-bot-detail-cmd-name">{cmd.cmd}</span>
                                        <span className="wk-bot-detail-cmd-desc">{cmd.remark}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isFriend ? (
                            <Button
                                theme="solid"
                                type="primary"
                                block
                                onClick={this.handleChat}
                                style={{ marginTop: 16 }}
                            >
                                发送消息
                            </Button>
                        ) : (
                            <Button
                                theme="solid"
                                type="primary"
                                block
                                loading={applying}
                                onClick={this.handleAddFriend}
                                style={{ marginTop: 16 }}
                            >
                                添加好友
                            </Button>
                        )}
                    </div>
                )}
            </Modal>
        );
    }
}
