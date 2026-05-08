import APIClient from './APIClient';

/**
 * AgentCardService
 * 
 * 封装 agent-card-server 接口调用，获取 Agent 运行时信息
 */

/** 文件分组 */
export interface FileGroup {
  label: string;
  files: FileItem[];
}

/** 文件项 */
export interface FileItem {
  name: string;
  path: string;
  size: string;
}

/** 文件内容 */
export interface FileContent {
  name: string;
  size: string;
  mtime: string;
  content: string;
}

/** Agent Card 响应 */
export interface AgentCardResponse {
  bot_id: string;
  session_total: number;
  session_running_count: number;
  last_report_at: string;
  runtime_info: RuntimeInfo;
  sessions: Session[];
  core_files: CoreFile[];
  memory_files: MemoryFile[];
}

/** 运行时信息 */
export interface RuntimeInfo {
  os_version: string;
  arch: string;
  disk_space_gb: number;
  memory_gb: number;
  app_data_dir: string;
  claw_version: string;
  admin_url: string;
  team_name: string;
  process_status: string;
  gateway_status: string;
  gateway_name: string;
  claw_id: string;
  gateway_total_agents: number;
  gateway_alive_agents: number;
  nodejs_version: string;
  network_latency_ms: number;
  last_heartbeat_at: string;
  memory_retention_count: number;
  memory_retention_note: string;
}

/** Session 信息 */
export interface Session {
  session_id: string;
  session_key: string;
  channel: string;
  status: string;
  peer_name: string;
  peer_type: string;
  group_member_count: number | null;
  model: string;
  context_used: number;
  context_total: number;
  context_percent: number;
  last_user_message: string;
  last_active_at: string;
}

/** 核心文件 */
export interface CoreFile {
  file_name: string;
  category: string;
  file_size: number;
  content_preview: string;
  last_synced_at: string;
}

/** 记忆文件 */
export interface MemoryFile {
  file_name: string;
  file_size: number;
  content_preview: string;
  last_synced_at: string;
}

/** 文件内容响应 */
export interface FileContentResponse {
  bot_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  content: string;
  last_synced_at: string;
}

class AgentCardService {
  private baseURL: string;

  constructor() {
    // 从环境变量读取 agent-card-server 地址
    this.baseURL = import.meta.env.VITE_AGENT_CARD_BASE_URL || '';
  }

  /**
   * 获取 Agent Card（包含概览、Session、文件列表）
   * @param botId Bot ID
   * @returns AgentCardResponse
   */
  async getAgentCard(botId: string): Promise<AgentCardResponse> {
    const response = await APIClient.shared.get<{ code: number; message: string; data: AgentCardResponse }>(
      `${this.baseURL}/api/v1/agent-cards/${botId}`
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to fetch agent card');
    }

    return response.data;
  }

  /**
   * 获取文件内容
   * @param botId Bot ID
   * @param fileName 文件路径（如 AGENTS.md 或 memory/2026-05-07.md）
   * @returns FileContent
   */
  async getFileContent(botId: string, fileName: string): Promise<FileContent> {
    const response = await APIClient.shared.get<{ code: number; message: string; data: FileContentResponse }>(
      `${this.baseURL}/api/v1/agent-cards/${botId}/files/${fileName}`
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to fetch file content');
    }

    const data = response.data;
    return {
      name: data.file_name,
      size: this.formatFileSize(data.file_size),
      mtime: this.formatTime(data.last_synced_at),
      content: data.content,
    };
  }

  /**
   * 将 AgentCardResponse 转换为 FileViewer 所需的 FileGroup[]
   * @param agentCard AgentCardResponse
   * @returns FileGroup[]
   */
  buildFileGroups(agentCard: AgentCardResponse): FileGroup[] {
    const groups: FileGroup[] = [];

    // 按 category 分组核心文件
    const identityFiles: CoreFile[] = [];
    const toolsFiles: CoreFile[] = [];
    const otherFiles: CoreFile[] = [];

    agentCard.core_files.forEach((file) => {
      if (file.category === 'identity') {
        identityFiles.push(file);
      } else if (file.category === 'tools') {
        toolsFiles.push(file);
      } else {
        otherFiles.push(file);
      }
    });

    if (identityFiles.length > 0) {
      groups.push({
        label: '身份与人格',
        files: identityFiles.map((f) => ({
          name: f.file_name,
          path: f.file_name,
          size: this.formatFileSize(f.file_size),
        })),
      });
    }

    if (toolsFiles.length > 0) {
      groups.push({
        label: '工具与行为',
        files: toolsFiles.map((f) => ({
          name: f.file_name,
          path: f.file_name,
          size: this.formatFileSize(f.file_size),
        })),
      });
    }

    if (otherFiles.length > 0) {
      groups.push({
        label: '其他',
        files: otherFiles.map((f) => ({
          name: f.file_name,
          path: f.file_name,
          size: this.formatFileSize(f.file_size),
        })),
      });
    }

    // 记忆文件单独分组
    if (agentCard.memory_files.length > 0) {
      groups.push({
        label: '记忆',
        files: agentCard.memory_files.map((f) => ({
          name: f.file_name,
          path: f.file_name,
          size: this.formatFileSize(f.file_size),
        })),
      });
    }

    return groups;
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的字符串（如 "412B" / "1.4KB"）
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  }

  /**
   * 格式化时间
   * @param isoTime ISO 8601 时间字符串
   * @returns 格式化后的字符串（如 "2026-05-07 16:12"）
   */
  private formatTime(isoTime: string): string {
    const date = new Date(isoTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
}

export default new AgentCardService();
