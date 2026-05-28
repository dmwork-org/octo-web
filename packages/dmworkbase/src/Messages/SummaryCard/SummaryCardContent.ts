import { MessageContent } from "wukongimjssdk";
import { t } from "../../i18n";

export class SummaryCardContent extends MessageContent {
  taskId!: number;
  taskNo!: string;
  title!: string;
  sourceCount!: number;
  totalMsgCount!: number;
  timeRangeStart!: string;
  timeRangeEnd!: string;
  summaryMode!: number;
  spaceId!: string;

  get contentType() {
    return 15;
  }

  get conversationDigest() {
    return t("base.message.digest.summaryCard");
  }

  encodeJSON(): Record<string, any> {
    return {
      type: this.contentType,
      task_id: this.taskId,
      task_no: this.taskNo,
      title: this.title,
      source_count: this.sourceCount,
      total_msg_count: this.totalMsgCount,
      time_range_start: this.timeRangeStart,
      time_range_end: this.timeRangeEnd,
      summary_mode: this.summaryMode,
      space_id: this.spaceId,
    };
  }

  decodeJSON(content: Record<string, any>): void {
    this.taskId = content.task_id;
    this.taskNo = content.task_no;
    this.title = content.title;
    this.sourceCount = content.source_count;
    this.totalMsgCount = content.total_msg_count;
    this.timeRangeStart = content.time_range_start;
    this.timeRangeEnd = content.time_range_end;
    this.summaryMode = content.summary_mode;
    this.spaceId = content.space_id;
  }
}

export default SummaryCardContent;
