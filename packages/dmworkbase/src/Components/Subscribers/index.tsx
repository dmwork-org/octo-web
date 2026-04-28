import { Channel, Subscriber } from "wukongimjssdk";
import React from "react";
import { Component } from "react";
import Provider from "../../Service/Provider";
import WKApp from "../../App";
import "./index.css";
import { SubscribersVM } from "./vm";
import IndexTable, { IndexTableItem } from "../IndexTable";
import WKBase, { WKBaseContext } from "../WKBase";
import RouteContext, { RouteContextConfig } from "../../Service/Context";
import { SubscriberList } from "./list";
import { resolveExternalForViewer } from "../../Utils/externalViewer";

export interface SubscribersProps {
  context: RouteContext<any>;
  channel: any;
  onAdd?: () => void;
  onRemove?: () => void;
}

export class Subscribers extends Component<SubscribersProps> {
  baseContext!: WKBaseContext;

  subscriberUI(subscriber: Subscriber) {
    // YUJ-64/YUJ-66: 外部成员按当前查看 Space 相对渲染；采用企微风格
    // 「昵称 @SpaceName」后缀格式，无紫色「外部」Tag、无「来自」前缀。
    const { isExternal, sourceSpaceName } = resolveExternalForViewer({
      homeSpaceId: subscriber.orgData?.home_space_id,
      homeSpaceName: subscriber.orgData?.home_space_name,
      isExternalLegacy: subscriber.orgData?.is_external,
      sourceSpaceNameLegacy: subscriber.orgData?.source_space_name,
    });
    return (
      <div
        key={subscriber.uid}
        className="wk-subscribers-item"
        onClick={() => {
          const vercode = subscriber.orgData?.vercode;
          WKApp.shared.baseContext.showUserInfo(
            subscriber.uid,
            subscriber.channel,
            vercode
          );
        }}
      >
        <img src={WKApp.shared.avatarUser(subscriber.uid)} alt=""></img>
        <div className="wk-subscribers-item-name">
          {subscriber.remark || subscriber.name}
        </div>
        {isExternal && sourceSpaceName && (
          <span
            className="wk-subscribers-item-space"
            title={`@${sourceSpaceName}`}
          >
            @{sourceSpaceName}
          </span>
        )}
      </div>
    );
  }

  render() {
    const { context, onAdd, onRemove, channel } = this.props;
    return (
      <Provider
        create={() => {
          return new SubscribersVM(context);
        }}
        render={(vm: SubscribersVM) => {
          return (
            <WKBase
              onContext={(baseContext) => {
                this.baseContext = baseContext;
              }}
            >
              <div className="wk-subscribers">
                <div className="wk-subscribers-content">
                  {vm.subscribersTop.map((subscriber) => {
                    return this.subscriberUI(subscriber);
                  })}
                  {/* {vm.showAdd() ? (
                    <div
                      className="wk-subscribers-item"
                      onClick={() => {
                        if (onAdd) {
                          onAdd();
                        }
                      }}
                    >
                      <img
                        src={require("./assets/icon_add_more_gray.png")}
                        alt=""
                      ></img>
                    </div>
                  ) : undefined} */}
                  {vm.showAdd()
                    ? WKApp.endpoints.organizationalTool(
                      channel,
                      <div className="wk-subscribers-item">
                        <img
                          src={require("./assets/icon_add_more_gray.png")}
                          alt=""
                        />
                      </div>
                    )
                    : undefined}
                  {vm.showRemove() ? (
                    <div
                      className="wk-subscribers-item"
                      onClick={() => {
                        if (onRemove) {
                          onRemove();
                        }
                      }}
                    >
                      <img
                        src={require("./assets/icon_delete_more_gray.png")}
                        alt=""
                      />
                    </div>
                  ) : undefined}
                </div>
                {vm.hasMoreSubscribers() ? (
                  <div
                    className="wk-subscribers-more"
                    onClick={() => {
                      context.push(
                       <SubscriberList channel={channel} />,
                        new RouteContextConfig({
                          title: "成员列表",
                        })
                      );
                    }}
                  >
                    查看更多群成员
                  </div>
                ) : undefined}
              </div>
            </WKBase>
          );
        }}
      ></Provider>
    );
  }
}
