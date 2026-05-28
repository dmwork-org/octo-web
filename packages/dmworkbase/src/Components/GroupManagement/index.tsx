import React, { Component } from "react";
import { Button, Spin, Tag, Modal, Toast } from "@douyinfe/semi-ui";
import { Channel, Subscriber } from "wukongimjssdk";
import WKApp from "../../App";
import WKAvatar from "../WKAvatar";
import { SubscriberList } from "../Subscribers/list";
import RouteContext, { RouteContextConfig } from "../../Service/Context";
import { GroupRole } from "../../Service/Const";
import { I18nContext, t } from "../../i18n";
import "./index.css";

export interface GroupManagementProps {
  channel: Channel;
  isCreator: boolean;
  context: RouteContext<any>;
}

interface GroupManagementState {
  loading: boolean;
  managers: Subscriber[];
  botAdmins: Subscriber[];
}

export class GroupManagement extends Component<
  GroupManagementProps,
  GroupManagementState
> {
  static contextType = I18nContext;
  declare context: React.ContextType<typeof I18nContext>;

  constructor(props: GroupManagementProps) {
    super(props);
    this.state = {
      loading: true,
      managers: [],
      botAdmins: [],
    };
  }

  componentDidMount() {
    this.loadMembers();
  }

  loadMembers = async () => {
    const { channel } = this.props;
    const pageSize = 50;
    const managers: Subscriber[] = [];
    const botAdmins: Subscriber[] = [];

    try {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const members = await WKApp.dataSource.channelDataSource.subscribers(
          channel,
          { limit: pageSize, page }
        );
        for (const m of members) {
          if (m.role === GroupRole.owner || m.role === GroupRole.manager) {
            managers.push(m);
          }
          if (m.orgData?.robot === 1 && m.orgData?.bot_admin === 1) {
            botAdmins.push(m);
          }
        }
        hasMore = members.length >= pageSize;
        page++;
      }
      this.setState({ managers, botAdmins, loading: false });
    } catch (err: any) {
      Toast.error(err?.msg || t("base.groupManagement.loadFailed"));
      this.setState({ loading: false });
    }
  };

  handleRemoveManager = (subscriber: Subscriber) => {
    const { channel } = this.props;
    Modal.confirm({
      title: t("base.groupManagement.removeManagerTitle"),
      content: t("base.groupManagement.removeManagerContent", {
        values: { name: subscriber.remark || subscriber.name },
      }),
      okText: t("base.common.ok"),
      cancelText: t("base.common.cancel"),
      onOk: async () => {
        try {
          await WKApp.dataSource.channelDataSource.managerRemove(channel, [
            subscriber.uid,
          ]);
          Toast.success(t("base.groupManagement.removed"));
          this.loadMembers();
        } catch (err: any) {
          Toast.error(err?.msg || t("base.groupManagement.operationFailed"));
        }
      },
    });
  };

  handleRemoveBotAdmin = (subscriber: Subscriber) => {
    const { channel } = this.props;
    Modal.confirm({
      title: t("base.groupManagement.removeBotAdminTitle"),
      content: t("base.groupManagement.removeBotAdminContent", {
        values: { name: subscriber.remark || subscriber.name },
      }),
      okText: t("base.common.ok"),
      cancelText: t("base.common.cancel"),
      onOk: async () => {
        try {
          await WKApp.dataSource.channelDataSource.removeBotAdmin(
            channel,
            subscriber.uid
          );
          Toast.success(t("base.groupManagement.removed"));
          this.loadMembers();
        } catch (err: any) {
          Toast.error(err?.msg || t("base.groupManagement.operationFailed"));
        }
      },
    });
  };

  handleAddManager = () => {
    const { channel, context } = this.props;
    const { managers } = this.state;
    const disableList = managers.map((m) => m.uid);

    let selectedItems: Subscriber[] = [];

    context.push(
      <SubscriberList
        channel={channel}
        canSelect={true}
        disableSelectList={disableList}
        filter={(s) => s.orgData?.robot !== 1 && s.role === GroupRole.normal}
        onSelect={(items) => {
          selectedItems = items;
        }}
      />,
      new RouteContextConfig({
        title: t("base.groupManagement.addManager"),
        showFinishButton: true,
        finishButtonTitle: t("base.common.ok"),
        onFinish: async () => {
          if (selectedItems.length === 0) {
            Toast.warning(t("base.groupManagement.selectMember"));
            return;
          }
          try {
            await WKApp.dataSource.channelDataSource.managerAdd(
              channel,
              selectedItems.map((s) => s.uid)
            );
            Toast.success(t("base.groupManagement.added"));
            context.pop();
            this.loadMembers();
          } catch (err: any) {
            Toast.error(err?.msg || t("base.groupManagement.operationFailed"));
          }
        },
      })
    );
  };

  handleAddBotAdmin = () => {
    const { channel, context } = this.props;
    const { botAdmins } = this.state;
    const disableList = botAdmins.map((m) => m.uid);

    let selectedItems: Subscriber[] = [];

    context.push(
      <SubscriberList
        channel={channel}
        canSelect={true}
        disableSelectList={disableList}
        filter={(s) => s.orgData?.robot === 1 && s.orgData?.bot_admin !== 1}
        onSelect={(items) => {
          selectedItems = items;
        }}
      />,
      new RouteContextConfig({
        title: t("base.groupManagement.addBotAdmin"),
        showFinishButton: true,
        finishButtonTitle: t("base.common.ok"),
        onFinish: async () => {
          if (selectedItems.length === 0) {
            Toast.warning(t("base.groupManagement.selectBot"));
            return;
          }
          const uid = selectedItems[0].uid;
          try {
            await WKApp.dataSource.channelDataSource.setBotAdmin(
              channel,
              uid
            );
            Toast.success(t("base.groupManagement.added"));
            context.pop();
            this.loadMembers();
          } catch (err: any) {
            Toast.error(err?.msg || t("base.groupManagement.operationFailed"));
          }
        },
      })
    );
  };

  render() {
    const { isCreator } = this.props;
    const { loading, managers, botAdmins } = this.state;

    if (loading) {
      return (
        <div className="wk-group-mgmt">
          <div className="wk-group-mgmt-loading">
            <Spin size="large" />
          </div>
        </div>
      );
    }

    return (
      <div className="wk-group-mgmt">
        {/* 群主、管理员 */}
        <div className="wk-group-mgmt-section">
          <div className="wk-group-mgmt-section-header">
            <span className="wk-group-mgmt-section-title">{t("base.groupManagement.ownerAndManagers")}</span>
            {isCreator && (
              <Button size="small" onClick={this.handleAddManager}>
                {t("base.groupManagement.addManager")}
              </Button>
            )}
          </div>
          <div className="wk-group-mgmt-list">
            {managers.map((item) => (
              <div className="wk-group-mgmt-item" key={item.uid}>
                <div className="wk-group-mgmt-item-avatar">
                  <WKAvatar src={item.avatar} />
                </div>
                <div className="wk-group-mgmt-item-info">
                  <span className="wk-group-mgmt-item-name">
                    {item.remark || item.name}
                  </span>
                  {item.role === GroupRole.owner && (
                    <Tag size="small" color="orange">
                      {t("base.groupManagement.owner")}
                    </Tag>
                  )}
                  {item.role === GroupRole.manager && (
                    <Tag size="small" color="blue">
                      {t("base.groupManagement.manager")}
                    </Tag>
                  )}
                </div>
                {isCreator && item.role === GroupRole.manager && (
                  <div className="wk-group-mgmt-item-action">
                    <span
                      className="wk-group-mgmt-remove-btn"
                      onClick={() => this.handleRemoveManager(item)}
                    >
                      ⊖
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bot 管理员 */}
        <div className="wk-group-mgmt-section">
          <div className="wk-group-mgmt-section-header">
            <span className="wk-group-mgmt-section-title">{t("base.groupManagement.botAdmins")}</span>
            <Button size="small" onClick={this.handleAddBotAdmin}>
              {t("base.groupManagement.addBotAdmin")}
            </Button>
          </div>
          <div className="wk-group-mgmt-list">
            {botAdmins.length === 0 ? (
              <div className="wk-group-mgmt-empty">{t("base.groupManagement.noBotAdmins")}</div>
            ) : (
              botAdmins.map((item) => (
                <div className="wk-group-mgmt-item" key={item.uid}>
                  <div className="wk-group-mgmt-item-avatar">
                    <WKAvatar src={item.avatar} />
                  </div>
                  <div className="wk-group-mgmt-item-info">
                    <span className="wk-group-mgmt-item-name">
                      {item.remark || item.name}
                    </span>
                    <Tag size="small" color="green">
                      {t("base.groupManagement.botAdmin")}
                    </Tag>
                  </div>
                  <div className="wk-group-mgmt-item-action">
                    <span
                      className="wk-group-mgmt-remove-btn"
                      onClick={() => this.handleRemoveBotAdmin(item)}
                    >
                      ⊖
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }
}
