import React, { Component } from "react";
import { Button, TextArea, Spin, Modal } from "@douyinfe/semi-ui";
import { Toast } from "@douyinfe/semi-ui";
import { Channel } from "wukongimjssdk";
import WKApp from "../../App";
import { ChannelTypeCommunityTopic } from "../../Service/Const";
import { parseThreadChannelId } from "../../Service/Thread";
import "./index.css";

export interface GroupMdEditorProps {
  channel: Channel;
  canEdit: boolean;
}

interface GroupMdEditorState {
  loading: boolean;
  content: string;
  originalContent: string;
  mode: "edit" | "preview";
  saving: boolean;
  version: number;
}

const MAX_BYTES = 10240;

function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

const PLACEHOLDER_TEXT = `# 群组说明

## 简介
描述本群的用途和主题...

## 规则
1. 规则一
2. 规则二

## 常用链接
- 链接一
- 链接二
`;

export class GroupMdEditor extends Component<
  GroupMdEditorProps,
  GroupMdEditorState
> {
  constructor(props: GroupMdEditorProps) {
    super(props);
    this.state = {
      loading: true,
      content: "",
      originalContent: "",
      mode: props.canEdit ? "edit" : "preview",
      saving: false,
      version: 0,
    };
  }

  componentDidMount() {
    this.loadContent();
  }

  private isThreadMd(): boolean {
    return this.props.channel.channelType === ChannelTypeCommunityTopic;
  }

  private getThreadInfo(): { groupNo: string; shortId: string } | null {
    return parseThreadChannelId(this.props.channel.channelID);
  }

  loadContent = async () => {
    try {
      let resp;
      if (this.isThreadMd()) {
        const parsed = this.getThreadInfo();
        if (!parsed) {
          this.setState({ loading: false });
          return;
        }
        resp = await WKApp.dataSource.channelDataSource.getThreadMd(
          parsed.groupNo,
          parsed.shortId
        );
      } else {
        resp = await WKApp.dataSource.channelDataSource.getGroupMd(
          this.props.channel
        );
      }
      this.setState({
        content: resp?.content || "",
        originalContent: resp?.content || "",
        version: resp?.version || 0,
        loading: false,
      });
    } catch {
      this.setState({ loading: false });
    }
  };

  handleSave = async () => {
    const { content } = this.state;

    const byteLen = getByteLength(content);
    if (byteLen > MAX_BYTES) {
      Toast.error("内容超出大小限制");
      return;
    }

    this.setState({ saving: true });
    try {
      let resp;
      if (this.isThreadMd()) {
        const parsed = this.getThreadInfo();
        if (!parsed) {
          this.setState({ saving: false });
          return;
        }
        resp = await WKApp.dataSource.channelDataSource.updateThreadMd(
          parsed.groupNo,
          parsed.shortId,
          content
        );
      } else {
        resp = await WKApp.dataSource.channelDataSource.updateGroupMd(
          this.props.channel,
          content
        );
      }
      this.setState({
        originalContent: content,
        version: resp.version,
        saving: false,
      });
      Toast.success("已保存");
    } catch (err: any) {
      Toast.error(err?.msg || "保存失败");
      this.setState({ saving: false });
    }
  };

  handleDelete = () => {
    Modal.confirm({
      title: "删除 GROUP.md",
      content: "确定要删除 GROUP.md 吗？此操作不可撤销。",
      onOk: async () => {
        try {
          if (this.isThreadMd()) {
            const parsed = this.getThreadInfo();
            if (!parsed) {
              Toast.error("无法解析子区信息");
              return;
            }
            await WKApp.dataSource.channelDataSource.deleteThreadMd(
              parsed.groupNo,
              parsed.shortId
            );
          } else {
            await WKApp.dataSource.channelDataSource.deleteGroupMd(
              this.props.channel
            );
          }
          this.setState({
            content: "",
            originalContent: "",
            version: 0,
          });
          Toast.success("已删除");
        } catch (err: any) {
          Toast.error(err?.msg || "删除失败");
        }
      },
    });
  };

  render() {
    const { canEdit } = this.props;
    const { loading, content, originalContent, mode, saving, version } =
      this.state;
    const byteLen = getByteLength(content);
    const overLimit = byteLen > MAX_BYTES;

    if (loading) {
      return (
        <div className="wk-groupmd-editor">
          <div className="wk-groupmd-loading">
            <Spin size="large" />
          </div>
        </div>
      );
    }

    return (
      <div className="wk-groupmd-editor">
        {canEdit && (
          <div className="wk-groupmd-toolbar">
            <div className="wk-groupmd-tabs">
              <Button
                type={mode === "edit" ? "primary" : "tertiary"}
                size="small"
                onClick={() => this.setState({ mode: "edit" })}
              >
                编辑
              </Button>
              <Button
                type={mode === "preview" ? "primary" : "tertiary"}
                size="small"
                onClick={() => this.setState({ mode: "preview" })}
              >
                预览
              </Button>
            </div>
            <div className="wk-groupmd-actions">
              {originalContent && (
                <Button
                  type="danger"
                  size="small"
                  onClick={this.handleDelete}
                >
                  删除
                </Button>
              )}
              <Button
                type="primary"
                size="small"
                loading={saving}
                disabled={content === originalContent || overLimit}
                onClick={this.handleSave}
              >
                保存
              </Button>
            </div>
          </div>
        )}

        {canEdit && (
          <div
            className={`wk-groupmd-bytecount ${overLimit ? "wk-groupmd-bytecount-over" : ""}`}
          >
            {byteLen} / {MAX_BYTES} bytes
            {version > 0 && <span className="wk-groupmd-version">v{version}</span>}
          </div>
        )}

        {mode === "edit" && canEdit ? (
          <div className="wk-groupmd-edit-area">
            <TextArea
              value={content}
              onChange={(value) => this.setState({ content: value })}
              placeholder={PLACEHOLDER_TEXT}
              autosize={{ minRows: 15 }}
              style={{ fontFamily: "monospace" }}
            />
          </div>
        ) : (
          <div className="wk-groupmd-preview">
            {content ? (
              <pre className="wk-groupmd-preview-content">{content}</pre>
            ) : (
              <div className="wk-groupmd-empty">暂未配置 GROUP.md</div>
            )}
          </div>
        )}
      </div>
    );
  }
}
