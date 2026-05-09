import React, { Component } from "react";
import { Button, Spin, Toast, Input, TextArea } from "@douyinfe/semi-ui";
import axios from "axios";
import WKModal from "../WKModal";
import { Channel, ChannelTypePerson, WKSDK } from "wukongimjssdk";
import WKApp from "../../App";
import WKAvatar from "../WKAvatar";
import AiBadge from "../AiBadge";
import ClawInfoModal from "../ClawInfoModal/ClawInfoModal";
import AgentCardService from "../../Service/AgentCardService";
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
    creatorUid: string;
    botCommands: string;
    isFriend: boolean;
    applying: boolean;
    showApplyInput: boolean;
    applyRemark: string;
    uploadingAvatar: boolean;
    editingDescription: boolean;
    descriptionDraft: string;
    savingDescription: boolean;
    // Agent Card 上报状态（true=已上报，false=未上报，null=加载中）
    reported: boolean | null;
    reportStatusLoading: boolean;
    showClawInfo: boolean;
}

export default class BotDetailModal extends Component<BotDetailModalProps, BotDetailModalState> {
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private $fileInput: HTMLInputElement | null = null;

    state: BotDetailModalState = {
        loading: true,
        name: "",
        username: "",
        description: "",
        creatorName: "",
        creatorUid: "",
        botCommands: "",
        isFriend: false,
        applying: false,
        showApplyInput: false,
        applyRemark: "",
        uploadingAvatar: false,
        editingDescription: false,
        descriptionDraft: "",
        savingDescription: false,
        reported: null,
        reportStatusLoading: false,
        showClawInfo: false,
    };

    componentDidMount() {
        if (this.props.uid) {
            this.loadBotInfo();
            this.loadReportStatus();
        }
    }

    componentDidUpdate(prevProps: BotDetailModalProps) {
        if (prevProps.uid !== this.props.uid && this.props.uid) {
            this.loadBotInfo();
            this.loadReportStatus();
        }
    }

    componentWillUnmount() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    loadReportStatus = async () => {
        const requestedUid = this.props.uid;
        if (!requestedUid) return;

        const isStale = () => this.props.uid !== requestedUid;

        this.setState({ reported: null, reportStatusLoading: true });
        try {
            const result = await AgentCardService.getReportStatus(requestedUid);
            if (isStale()) return; // 如果已切换到其他 bot，忽略旧请求
            this.setState({ reported: result });
        } catch (error) {
            if (isStale()) return;
            console.error("[BotDetailModal] loadReportStatus failed:", error);
            // 网络错误时不设置 reported，避免误导用户
            // reported 保持 null，不显示 OctoPush chip 和龙虾按钮
        } finally {
            if (!isStale()) {
                this.setState({ reportStatusLoading: false });
            }
        }
    };

    loadBotInfo = async () => {
        const requestedUid = this.props.uid;
        if (!requestedUid) return;

        // Reset all bot-specific state at the start of each load so that
        // a new uid (e.g. when the modal instance is reused by BotStore /
        // GlobalSearch / Subscribers) cannot see leftover state from the
        // previously displayed bot.
        this.setState({
            loading: true,
            name: "",
            username: "",
            description: "",
            creatorName: "",
            creatorUid: "",
            botCommands: "",
            isFriend: false,
            applying: false,
            showApplyInput: false,
            applyRemark: "",
            uploadingAvatar: false,
            editingDescription: false,
            descriptionDraft: "",
            savingDescription: false,
        });

        const isStale = () => this.props.uid !== requestedUid;

        try {
            // 用 user detail API 获取完整信息（包含 follow）
            const data = await WKApp.apiClient.get(`users/${requestedUid}`);
            if (isStale()) return;
            this.setState({
                loading: false,
                name: data.name || requestedUid,
                username: data.username || requestedUid,
                description: data.bot_description || "暂无简介",
                creatorName: data.bot_creator_name || "",
                creatorUid: data.bot_creator_uid || "",
                botCommands: data.bot_commands || "",
                isFriend: data.follow === 1,
                editingDescription: false,
            });
        } catch {
            // fallback to channel info
            try {
                const channelInfo = await WKSDK.shared().channelManager.fetchChannelInfo(
                    new Channel(requestedUid, ChannelTypePerson)
                );
                if (isStale()) return;
                this.setState({
                    loading: false,
                    name: channelInfo?.title || requestedUid,
                    username: requestedUid,
                    description: channelInfo?.orgData?.bot_description || "暂无简介",
                    creatorName: channelInfo?.orgData?.bot_creator_name || "",
                    creatorUid: channelInfo?.orgData?.bot_creator_uid || "",
                    botCommands: channelInfo?.orgData?.bot_commands || "",
                    isFriend: channelInfo?.orgData?.follow === 1,
                    editingDescription: false,
                });
            } catch {
                if (isStale()) return;
                // Keep the reset done above (creatorUid="") so isOwner()
                // can never return true for a bot we failed to load.
                this.setState({
                    loading: false,
                    name: requestedUid,
                    username: requestedUid,
                    description: "暂无简介",
                    creatorName: "",
                    creatorUid: "",
                    botCommands: "",
                    isFriend: false,
                    editingDescription: false,
                });
            }
        }
    };

    handleChat = () => {
        const { uid, onChat, onClose } = this.props;
        // WuKongIM DM 只认裸 uid
        onChat(new Channel(uid, ChannelTypePerson));
        onClose();
    };

    // === Owner 头像编辑 ===
    handleAvatarClick = () => {
        if (!this.isOwner() || this.state.uploadingAvatar) return;
        this.$fileInput?.click();
    };

    handleAvatarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.handleAvatarClick();
        }
    };

    handleEditDescriptionKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.handleStartEditDescription();
        }
    };

    handleAvatarInputClick = (event: React.MouseEvent<HTMLInputElement>) => {
        // 允许连续选中同一文件
        (event.target as HTMLInputElement).value = "";
    };

    handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const { uid } = this.props;
        const param = new FormData();
        param.append("file", file);
        this.setState({ uploadingAvatar: true });
        try {
            await axios.post(`users/${uid}/avatar`, param, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    "token": WKApp.loginInfo.token || "",
                },
            });
            WKApp.shared.changeChannelAvatarTag(new Channel(uid, ChannelTypePerson));
            // 触发 channelInfoListener，通知其他组件刷新头像
            WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
            Toast.success("头像已更新");
            this.forceUpdate();
        } catch (err) {
            Toast.error("头像上传失败，请重试");
        } finally {
            this.setState({ uploadingAvatar: false });
        }
    };

    // === Owner 简介编辑 ===
    handleStartEditDescription = () => {
        if (!this.isOwner()) return;
        const { description } = this.state;
        const raw = description === "暂无简介" ? "" : description.replace(/\*\*/g, "");
        this.setState({ editingDescription: true, descriptionDraft: raw });
    };

    handleCancelEditDescription = () => {
        this.setState({ editingDescription: false, descriptionDraft: "" });
    };

    handleSaveDescription = async () => {
        const { uid } = this.props;
        const { descriptionDraft } = this.state;
        this.setState({ savingDescription: true });
        try {
            await WKApp.apiClient.put(`robot/${uid}/description`, {
                description: descriptionDraft,
            });
            Toast.success("简介已更新");
            this.setState({
                description: descriptionDraft || "暂无简介",
                editingDescription: false,
                descriptionDraft: "",
            });
        } catch {
            Toast.error("简介更新失败");
        } finally {
            this.setState({ savingDescription: false });
        }
    };

    isOwner = () => {
        const { creatorUid } = this.state;
        const loginUid = WKApp.loginInfo.uid;
        return !!creatorUid && !!loginUid && creatorUid === loginUid;
    };

    handleShowApply = () => {
        const { name } = this.state;
        this.setState({
            showApplyInput: true,
            applyRemark: `我想使用${name.replace(/\*\*/g, '')}`,
        });
    };

    handleSubmitApply = async () => {
        const { uid } = this.props;
        const { applyRemark } = this.state;
        this.setState({ applying: true });
        try {
            const body: any = { to_uid: uid, remark: applyRemark };
            const spaceId = WKApp.shared.currentSpaceId;
            if (spaceId) {
                body.space_id = spaceId;
            }
            await WKApp.apiClient.post("friend/apply", body);
            Toast.success("好友申请已发送");
            this.setState({ showApplyInput: false });
            this.refreshTimer = setTimeout(() => this.loadBotInfo(), 500);
        } catch {
            Toast.error("申请失败");
        } finally {
            this.setState({ applying: false });
        }
    };

    handleViewClawInfo = () => {
        this.setState({ showClawInfo: true });
    };

    render() {
        const { visible, onClose, uid } = this.props;
        const {
            loading,
            name,
            username,
            description,
            creatorName,
            botCommands,
            isFriend,
            applying,
            showApplyInput,
            applyRemark,
            uploadingAvatar,
            editingDescription,
            descriptionDraft,
            savingDescription,
            reported,
            reportStatusLoading,
            showClawInfo,
        } = this.state;
        const isOwner = this.isOwner();

        let commands: { cmd: string; remark: string }[] = [];
        try {
            if (botCommands) commands = JSON.parse(botCommands);
        } catch {}

        return (
            <>
            <WKModal
                title={null}
                visible={visible}
                onCancel={onClose}
                className="wk-bot-detail-modal"
            >
                {loading ? (
                    <div style={{ textAlign: "center", padding: 40 }}>
                        <Spin size="large" />
                    </div>
                ) : (
                    <div className="wk-bot-detail-content">
                        <div className="wk-bot-detail-header">
                            {isOwner ? (
                                <div
                                    className="wk-bot-detail-avatar wk-bot-detail-avatar--owner"
                                    onClick={this.handleAvatarClick}
                                    onKeyDown={this.handleAvatarKeyDown}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="更换头像"
                                >
                                    <WKAvatar channel={new Channel(uid, ChannelTypePerson)} size={64} />
                                    <div className="wk-bot-detail-avatar-overlay">
                                        <span role="img" aria-label="更换头像">📷</span>
                                    </div>
                                    {uploadingAvatar && (
                                        <div className="wk-bot-detail-avatar-loading">
                                            <Spin />
                                        </div>
                                    )}
                                    <input
                                        ref={(ref) => { this.$fileInput = ref; }}
                                        type="file"
                                        accept="image/*"
                                        multiple={false}
                                        style={{ display: "none" }}
                                        onClick={this.handleAvatarInputClick}
                                        onChange={this.handleAvatarFileChange}
                                    />
                                </div>
                            ) : (
                                <WKAvatar channel={new Channel(uid, ChannelTypePerson)} size={64} />
                            )}
                            <div className="wk-bot-detail-name">
                                {name.replace(/\*\*/g, '')} <AiBadge />
                            </div>
                            <div className="wk-bot-detail-id">@{username}</div>
                            {isOwner && reported !== null && (
                                <div
                                    className={`wk-bot-detail-octopush-chip ${
                                        reported
                                            ? "wk-bot-detail-octopush-chip--reported"
                                            : "wk-bot-detail-octopush-chip--unmanaged"
                                    }`}
                                >
                                    <span className="wk-bot-detail-octopush-chip-icon">
                                        {reported ? "✅" : "🔌"}
                                    </span>
                                    <span className="wk-bot-detail-octopush-chip-text">
                                        {reported ? "已上报 Agent 信息" : "未上报 Agent 信息"}
                                    </span>
                                    {!reported && (
                                        <button
                                            className="wk-bot-detail-help-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                            }}
                                            title="请在 OctoPush 中打开该 Agent 的「上报机器信息」开关。"
                                            aria-label="帮助"
                                        >
                                            ?
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="wk-bot-detail-desc">
                            <div className="wk-bot-detail-label">
                                简介
                                {isOwner && !editingDescription && (
                                    <span
                                        className="wk-bot-detail-edit-icon"
                                        onClick={this.handleStartEditDescription}
                                        onKeyDown={this.handleEditDescriptionKeyDown}
                                        role="button"
                                        tabIndex={0}
                                        aria-label="编辑简介"
                                    >
                                        ✏️
                                    </span>
                                )}
                            </div>
                            {isOwner && editingDescription ? (
                                <div>
                                    <TextArea
                                        value={descriptionDraft}
                                        onChange={(v) => this.setState({ descriptionDraft: v })}
                                        placeholder="请输入简介"
                                        maxCount={200}
                                        autosize={{ minRows: 3, maxRows: 6 }}
                                        style={{ marginBottom: 8 }}
                                    />
                                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                        <Button
                                            size="small"
                                            onClick={this.handleCancelEditDescription}
                                            disabled={savingDescription}
                                        >
                                            取消
                                        </Button>
                                        <Button
                                            size="small"
                                            theme="solid"
                                            type="primary"
                                            loading={savingDescription}
                                            onClick={this.handleSaveDescription}
                                        >
                                            保存
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div>{description.replace(/\*\*/g, '')}</div>
                            )}
                        </div>
                        {creatorName && (
                            <div className="wk-bot-detail-desc">
                                <div className="wk-bot-detail-label">创建者</div>
                                <div>{creatorName}</div>
                            </div>
                        )}
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
                        {isOwner && reported !== null && (
                            <Button
                                block
                                disabled={!reported}
                                onClick={this.handleViewClawInfo}
                                className={`wk-bot-detail-claw-btn${!reported ? " wk-bot-detail-claw-btn--disabled" : ""}`}
                                style={{ marginTop: 16 }}
                                aria-label={reported ? "查看龙虾信息" : undefined}
                                data-tooltip={!reported ? "请在 OctoPush 中打开该 Agent 的「上报机器信息」开关。" : undefined}
                            >
                                🦞 查看龙虾信息
                            </Button>
                        )}
                        {isFriend ? (
                            <Button
                                theme="solid"
                                type="primary"
                                block
                                onClick={this.handleChat}
                                style={{ marginTop: isOwner && reported !== null ? 10 : 16 }}
                            >
                                发送消息
                            </Button>
                        ) : showApplyInput ? (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>申请消息</div>
                                <Input
                                    value={applyRemark}
                                    onChange={(v) => this.setState({ applyRemark: v })}
                                    placeholder="请输入申请消息"
                                    style={{ marginBottom: 12 }}
                                />
                                <Button
                                    theme="solid"
                                    type="primary"
                                    block
                                    loading={applying}
                                    disabled={!applyRemark}
                                    onClick={this.handleSubmitApply}
                                >
                                    发送申请
                                </Button>
                            </div>
                        ) : (
                            <Button
                                theme="solid"
                                type="primary"
                                block
                                onClick={this.handleShowApply}
                                style={{ marginTop: 16 }}
                            >
                                添加好友
                            </Button>
                        )}
                    </div>
                )}
            </WKModal>
            <ClawInfoModal
                botId={uid}
                botName={name}
                visible={showClawInfo}
                onClose={() => this.setState({ showClawInfo: false })}
            />
        </>
        );
    }
}
