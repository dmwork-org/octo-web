import type { Meta, StoryObj } from '@storybook/react';
import ClawCoreFilesTab from './ClawCoreFilesTab';
import AgentCardService from '../../Service/AgentCardService';
import type { AgentCardResponse, FileContentResponse } from '../../Service/AgentCardService';

/**
 * ClawCoreFilesTab - Tab ③ 核心文件
 * 
 * 展示 Agent 的核心文件列表，使用 FileViewer 组件进行预览。
 * 数据从 agent-card-server 获取。
 */
const meta: Meta<typeof ClawCoreFilesTab> = {
  title: 'Components/ClawCoreFilesTab',
  component: ClawCoreFilesTab,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Tab ③ 核心文件 - 展示 Agent 的核心文件（AGENTS.md / SOUL.md 等）和记忆文件。',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '600px', padding: '20px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ClawCoreFilesTab>;

// Mock AgentCardResponse
const mockAgentCard: AgentCardResponse = {
  bot_id: '01913a2b3c4d5e6f7890abcd_bot',
  session_total: 5,
  session_running_count: 2,
  last_report_at: '2026-05-07T10:31:00Z',
  runtime_info: {
    os_version: 'macOS 14.2',
    arch: 'arm64',
    disk_space_gb: 128.5,
    memory_gb: 32.0,
    app_data_dir: '/Users/agent/.openclaw',
    claw_version: '1.2.3',
    admin_url: 'http://localhost:3000/admin',
    team_name: 'MyTeam',
    process_status: 'running',
    gateway_status: 'connected',
    gateway_name: 'Gateway-1',
    claw_id: 'claw-a8f3d2e1',
    gateway_total_agents: 10,
    gateway_alive_agents: 8,
    nodejs_version: 'v20.11.0',
    network_latency_ms: 45.2,
    last_heartbeat_at: '2026-05-07T10:31:00Z',
    memory_retention_count: 50,
    memory_retention_note: '保留最近50天记忆',
  },
  sessions: [],
  core_files: [
    {
      file_name: 'AGENTS.md',
      category: 'identity',
      file_size: 412,
      content_preview: '# AGENTS.md\n\n你是一个全新的 OpenClaw Agent...',
      last_synced_at: '2026-05-07T16:12:00Z',
    },
    {
      file_name: 'SOUL.md',
      category: 'identity',
      file_size: 128,
      content_preview: '# SOUL.md\n\n你是一个乐于帮忙的 AI 助手。',
      last_synced_at: '2026-05-07T09:30:00Z',
    },
    {
      file_name: 'IDENTITY.md',
      category: 'identity',
      file_size: 256,
      content_preview: '# IDENTITY.md\n\n- **名字：** 皮皮虾',
      last_synced_at: '2026-05-07T09:30:00Z',
    },
    {
      file_name: 'USER.md',
      category: 'identity',
      file_size: 1400,
      content_preview: '# USER.md\n\n- **名字：** 罗敬为',
      last_synced_at: '2026-05-07T09:30:00Z',
    },
    {
      file_name: 'TOOLS.md',
      category: 'tools',
      file_size: 3100,
      content_preview: '# TOOLS.md\n\n## 联网搜索',
      last_synced_at: '2026-05-07T10:00:00Z',
    },
    {
      file_name: 'HEARTBEAT.md',
      category: 'tools',
      file_size: 192,
      content_preview: '# HEARTBEAT.md\n\n保持此文件为空...',
      last_synced_at: '2026-05-07T09:30:00Z',
    },
    {
      file_name: 'BOOTSTRAP.md',
      category: 'tools',
      file_size: 860,
      content_preview: '# BOOTSTRAP.md\n\n你刚刚苏醒...',
      last_synced_at: '2026-05-07T09:30:00Z',
    },
  ],
  memory_files: [
    {
      file_name: 'memory/2026-05-07.md',
      file_size: 2300,
      content_preview: '# 2026-05-07 皮皮虾的日记',
      last_synced_at: '2026-05-07T16:12:00Z',
    },
    {
      file_name: 'memory/2026-05-06.md',
      file_size: 1800,
      content_preview: '# 2026-05-06 皮皮虾的日记',
      last_synced_at: '2026-05-06T22:30:00Z',
    },
  ],
};

// Mock 文件内容
const mockFileContents: Record<string, FileContentResponse> = {
  'AGENTS.md': {
    bot_id: '01913a2b3c4d5e6f7890abcd_bot',
    file_name: 'AGENTS.md',
    content_type: 'text/markdown',
    file_size: 412,
    content: `# AGENTS.md

你是一个全新的 OpenClaw Agent，没有任何先前的记忆或身份。

## 工作区
这是你的家：\`~/.openclaw/workspace-main/\`

## 记忆
- 创建 \`memory/YYYY-MM-DD.md\` 文件来记录重要事件
- 更新 \`MEMORY.md\` 保存长期上下文

## 安全
- 不要在未经同意的情况下执行破坏性命令
- 对于外部行动（发送邮件、发布内容等）请先确认`,
    last_synced_at: '2026-05-07T16:12:00Z',
  },
  'SOUL.md': {
    bot_id: '01913a2b3c4d5e6f7890abcd_bot',
    file_name: 'SOUL.md',
    content_type: 'text/markdown',
    file_size: 128,
    content: `# SOUL.md

你是一个乐于帮忙的 AI 助手。

说话简洁、乐于帮忙、诚实可靠。`,
    last_synced_at: '2026-05-07T09:30:00Z',
  },
  'memory/2026-05-07.md': {
    bot_id: '01913a2b3c4d5e6f7890abcd_bot',
    file_name: 'memory/2026-05-07.md',
    content_type: 'text/markdown',
    file_size: 2300,
    content: `# 2026-05-07 皮皮虾的日记

## 今天的主要事件

LUO 让我帮忙产出 OctoPush V0.0.3 产品线框。

- 新增 Session 信息 Tab
- 新增核心文件 Tab
- 概览页增加 Agent-Bot 连接列表 + 上报开关`,
    last_synced_at: '2026-05-07T16:12:00Z',
  },
};

// Mock AgentCardService
const originalGetAgentCard = AgentCardService.getAgentCard;
const originalGetFileContent = AgentCardService.getFileContent;

const mockGetAgentCard = async (): Promise<AgentCardResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockAgentCard;
};

const mockGetFileContent = async (botId: string, fileName: string) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const fileData = mockFileContents[fileName];
  if (!fileData) {
    throw new Error('File not found');
  }
  return {
    name: fileData.file_name,
    size: AgentCardService['formatFileSize'](fileData.file_size) || `${fileData.file_size}B`,
    mtime: AgentCardService['formatTime'](fileData.last_synced_at) || fileData.last_synced_at,
    content: fileData.content,
  };
};

// 设置 mock
AgentCardService.getAgentCard = mockGetAgentCard;
AgentCardService.getFileContent = mockGetFileContent as any;

/**
 * 默认状态 - 展示完整的核心文件列表
 */
export const Default: Story = {
  args: {
    botId: '01913a2b3c4d5e6f7890abcd_bot',
  },
};

/**
 * 加载中状态
 */
export const Loading: Story = {
  args: {
    botId: 'loading_bot',
  },
  decorators: [
    (Story) => {
      // Mock 永不返回
      AgentCardService.getAgentCard = () => new Promise(() => {});
      return (
        <div style={{ height: '600px', padding: '20px' }}>
          <Story />
        </div>
      );
    },
  ],
};

/**
 * 错误状态
 */
export const Error: Story = {
  args: {
    botId: 'error_bot',
  },
  decorators: [
    (Story) => {
      // Mock 抛出错误
      AgentCardService.getAgentCard = async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        throw new Error('Network error');
      };
      return (
        <div style={{ height: '600px', padding: '20px' }}>
          <Story />
        </div>
      );
    },
  ],
};

/**
 * 空文件列表
 */
export const Empty: Story = {
  args: {
    botId: 'empty_bot',
  },
  decorators: [
    (Story) => {
      // Mock 返回空文件列表
      AgentCardService.getAgentCard = async () => ({
        ...mockAgentCard,
        core_files: [],
        memory_files: [],
      });
      return (
        <div style={{ height: '600px', padding: '20px' }}>
          <Story />
        </div>
      );
    },
  ],
};

// 恢复原始方法（Storybook 重新加载时需要）
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    AgentCardService.getAgentCard = originalGetAgentCard;
    AgentCardService.getFileContent = originalGetFileContent;
  });
}
