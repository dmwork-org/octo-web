/**
 * useAgentCardFile Hook
 * 
 * 用于获取 Agent Card 文件内容
 */

import { useState, useCallback, useRef } from 'react';
import { AgentCardService } from '@octo/base';
import type { FileContentData } from '../api/types';

interface UseAgentCardFileResult {
  /** 文件内容数据 */
  data: FileContentData | null;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 获取文件内容 */
  fetchFile: (fileName: string) => Promise<void>;
}

/**
 * 获取 Agent Card 文件内容
 * 
 * @param botId - Bot ID
 * @returns 文件内容数据、加载状态、错误信息
 * 
 * @example
 * ```tsx
 * const { data, loading, error, fetchFile } = useAgentCardFile('pipixia_bot');
 * 
 * // 获取文件
 * await fetchFile('AGENTS.md');
 * await fetchFile('memory/2026-05-07.md');
 * ```
 */
export function useAgentCardFile(botId: string | null): UseAgentCardFileResult {
  const [data, setData] = useState<FileContentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 用递增 requestId 区分并发请求，布尔值无法处理多个并发的情况
  const requestIdRef = useRef(0);

  const fetchFile = useCallback(
    async (fileName: string) => {
      if (!botId) {
        setError('Bot ID is required');
        return;
      }

      const currentId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await AgentCardService.getFileData(botId, fileName);
        if (currentId !== requestIdRef.current) return; // 已有更新的请求，忽略旧结果
        setData(result);
        setError(null);
      } catch (err) {
        if (currentId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch file content';
        setError(message);
        setData(null);
      } finally {
        if (currentId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [botId],
  );

  return {
    data,
    loading,
    error,
    fetchFile,
  };
}
