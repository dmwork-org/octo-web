// Matter module type definitions — aligned with matters service backend models.
// Frontend uses Matter types naming for backwards compatibility at the UI layer;
// the wire types match the backend Matter* structs.

// ─── Status enums ───────────────────────────────────────

export type MatterStatus = "open" | "done" | "archived";

// ─── Core models (match backend JSON exactly) ───────────

/**
 * Matter — from model.Matter in matters service.
 *
 * 负责人字段 (assignees):
 *   - 详情接口 GET /matters/:id 返回 MatterDetail, 必然带 assignees
 *   - 列表接口 GET /matters 自 todos PR #36 起每项也带 assignees (空数组而非 null)
 *   - 类型上保留 optional, 兼容历史接口或异常响应
 */
export interface Matter {
  id: string;
  seq_no: number;
  space_id: string;
  title: string;
  description?: string;
  creator_id: string;
  status: MatterStatus;
  deadline?: string;
  remind_at?: string;
  source_channel_id?: string;
  source_channel_type?: number;
  source_name?: string;
  source_msgs?: string[];
  assignees?: MatterAssignee[];
  created_at: string;
  updated_at: string;
}

/**
 * MatterDetail — from service.MatterDetail, returned by GET /matters/:id and POST /matters.
 * Extends Matter with assignees, participants, and linked channels.
 */
export interface MatterDetail extends Matter {
  assignees: MatterAssignee[];
  participants?: string[];
  channels?: MatterChannel[];
}

export interface MatterAssignee {
  id: string;
  matter_id: string;
  user_id: string;
  created_at: string;
}

export interface MatterChannel {
  id: string;
  matter_id: string;
  channel_id: string;
  channel_type: number;
  channel_name?: string;
  linked_by: string;
  created_at: string;
}

export interface TimelineAttachment {
  id: string;
  entry_id: string;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  matter_id: string;
  user_id: string;
  content: string | null;
  channel_id?: string;
  channel_type?: number;
  source_channel_id?: string;
  source_msgs?: string[];
  related_uids?: string[];
  created_at: string;
  attachments?: TimelineAttachment[];
}

/** @deprecated 使用 TimelineEntry 替代 */
export type MatterComment = TimelineEntry;
/** @deprecated 使用 TimelineAttachment 替代 */
export type CommentAttachment = TimelineAttachment;

// ─── Pagination ─────────────────────────────────────────

export interface Pagination {
  has_more: boolean;
  next_cursor?: string;
}

export interface PaginatedList<T> {
  data: T[];
  pagination: Pagination;
}

// ─── Request types ──────────────────────────────────────

export interface MatterListParams {
  status?: MatterStatus;
  assignee_id?: string;
  creator_id?: string;
  /**
   * 按来源频道过滤 (OR 扩展可见性):
   * 后端在 visibility 子句里多加一条 OR: 当前用户在该 channel 且 matter 关联了该
   * channel。返回结果是 "本群关联的 ∪ 我发起/我负责/我参与的" 并集, 不会缩小集合。
   * 需要严格 "只要本群关联的", 用 channel_id。
   */
  source_channel_id?: string;
  /** 按来源频道类型 (matters.source_channel_type) 严格 AND 过滤 */
  source_channel_type?: number;
  /**
   * 严格按 channel 过滤 (AND): 只返回通过 matter_channels 关联到该 channel 的
   * Matter。跟 source_channel_id 的关键区别是这条是 AND 而非 OR, 不会混入
   * "我相关但跟本群无关" 的 Matter。后端同样做 IM 成员验证 (非群成员传了会被
   * 忽略, 返回集合降级到可见性集合)。
   * 匹配原型 PRD §11 "当前 channel/thread 关联的所有 Matter" 的语义。
   */
  channel_id?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface CreateMatterReq {
  title: string;
  description?: string;
  assignee_ids?: string[];
  source_channel_id?: string;
  source_channel_type?: number;
  source_name?: string;
  deadline?: string;
  remind_at?: string;
  source_msgs?: ExtractMessage[];
}

export interface UpdateMatterReq {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
}

// ─── Extract (AI 智能创建) ──────────────────────────────

export interface ExtractMessageAttachment {
  file_name: string;
  file_url: string;
}

export interface ExtractMessage {
  message_id: string;
  from_uid: string;
  from_uname?: string;
  timestamp?: number;
  content?: string;
  attachments?: ExtractMessageAttachment[];
}

export interface ExtractMatterReq {
  channel_type: number;
  channel_id: string;
  channel_name?: string;
  creator_uid: string;
  msgs: ExtractMessage[];
}

export interface ExtractResult {
  id: string;
  seq_no: number;
  title: string;
  description: string;
  source_msgs: string[];
  deadline?: number | null;
  status: string;
  created_at: string;
}

// ─── Timeline ───────────────────────────────────────────

export interface TimelineAttachmentReq {
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TimelineReq {
  content?: string;
  attachments?: TimelineAttachmentReq[];
  channel_id?: string;
  channel_type?: number;
  channel_name?: string;
  participant_uid?: string;
  msgs?: ExtractMessage[];
}

/** @deprecated 使用 TimelineAttachmentReq 替代 */
export type CommentAttachmentReq = TimelineAttachmentReq;
/** @deprecated 使用 TimelineReq 替代 */
export type AddCommentReq = TimelineReq;

export interface LinkChannelReq {
  channel_id: string;
  channel_type: number;
  channel_name?: string;
}

export interface ListCommentsParams {
  source_channel_id?: string;
  limit?: number;
  cursor?: string;
}

// ─── Outputs (产出文件) ──────────────────────────────────

/**
 * MatterOutput — 产出文件条目。
 *
 * 后端 GET /matters/:id/outputs 返回的去重文件列表。
 * 按 sent_at DESC, id DESC 排序; 同一 file_url 只保留最早的行。
 *
 * 注: source_channel_id 是 **IM 的 channel_id** (e.g. 32 字符 hex),
 * 不是 matter_channels.id UUID。前端做 channel 反查时按
 * matter.channels[].channel_id 匹配, 不要按 matter.channels[].id。
 */
export interface MatterOutput {
  id: string;
  entry_id: string;
  matter_id: string;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  description?: string;
  sender_uid: string;
  /**
   * 后端在 ListAttachments 流程里用的是 messages 里 from_uname snapshot,
   * 上游 IM 偶尔可能给空。前端展示时建议用 ?? "" 兜底, 不要假设非空。
   */
  sender_uname: string;
  /** IM 的 channel_id (跟 timeline_entries.source_channel_id 同源), 见上方说明。 */
  source_channel_id?: string;
  source_channel_name?: string;
  sent_at: string;
}

export interface ListOutputsParams {
  limit?: number;
  cursor?: string;
  q?: string;
}

// ─── Activities (变更记录) ───────────────────────────────

/**
 * MatterActivity — 事项变更审计日志条目。
 *
 * 后端 model.MatterActivity (todos PR #39)。
 * Detail 是 JSON 对象, shape 取决于 action:
 *
 *   created:             {}
 *   title_changed:       { from: string, to: string }
 *   description_changed: { summary: string }
 *   deadline_changed:    { from: number|null, to: number|null }  (unix seconds)
 *   status_changed:      { from: string, to: string }
 *   assignee_added:      { user_id: string }
 *   assignee_removed:    { user_id: string }
 *   channel_linked:      { channel_id: string, channel_name?: string }
 *   channel_unlinked:    { channel_id: string }
 */
export interface MatterActivity {
  id: string;
  matter_id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ListActivitiesParams {
  limit?: number;
  cursor?: string;
}

// ─── API error ──────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
