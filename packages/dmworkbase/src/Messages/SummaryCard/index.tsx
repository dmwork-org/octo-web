import React from "react";
import MessageBase from "../Base";
import MessageTrail from "../Base/tail";
import { MessageBaseCellProps, MessageCell } from "../MessageCell";
import { SummaryCardContent } from "./SummaryCardContent";
import WKApp from "../../App";
import { I18nContext } from "../../i18n";
import "./index.css";

function formatShortDate(dateStr: string, locale: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "numeric",
    }).format(d);
}

export class SummaryCardCell extends MessageCell<MessageBaseCellProps> {
    static contextType = I18nContext;
    declare context: React.ContextType<typeof I18nContext>;

    render() {
        const { message, context } = this.props;
        const content = message.content as SummaryCardContent;
        const { locale, t } = this.context;

        const sourceLabel =
            content.summaryMode === 2
                ? t("base.summaryCard.memberCount", { values: { count: content.sourceCount } })
                : t("base.summaryCard.groupCount", { values: { count: content.sourceCount } });

        return (
            <MessageBase hiddeBubble={true} message={message} context={context}>
                <div className="wk-message-summary-card">
                    <div className="wk-message-summary-card-body">
                        <div className="wk-message-summary-card-header">
                            <span>📊</span>
                            <span>{t("base.summaryCard.title")}</span>
                        </div>
                        <div className="wk-message-summary-card-title">
                            {content.title}
                        </div>
                        <div className="wk-message-summary-card-meta">
                            {t("base.summaryCard.source")}{sourceLabel} | {t("base.summaryCard.messageCount", { values: { count: content.totalMsgCount } })}
                        </div>
                        <div className="wk-message-summary-card-meta">
                            {t("base.summaryCard.time")}{formatShortDate(content.timeRangeStart, locale)} - {formatShortDate(content.timeRangeEnd, locale)}
                        </div>
                        <div className="wk-message-summary-card-action">
                            <span
                                className="wk-message-summary-card-action-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    WKApp.openSummaryDetail?.(content.taskId);
                                }}
                            >
                                {t("base.summaryCard.viewFull")}
                            </span>
                        </div>
                    </div>
                    <div className="wk-message-summary-card-bottom">
                        <div className="wk-message-summary-card-bottom-flag">{t("base.summaryCard.title")}</div>
                        <div className="wk-message-summary-card-bottom-time">
                            <MessageTrail message={message} timeStyle={{ color: "#999" }} />
                        </div>
                    </div>
                </div>
            </MessageBase>
        );
    }
}

export default SummaryCardCell;
