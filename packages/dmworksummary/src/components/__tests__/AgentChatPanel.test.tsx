import React from 'react';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentChatPanel from '../AgentChatPanel';

// @octo/base 走 dmworkBase mock，其 I18nContext 默认值已带 t，直接渲染即可。
vi.mock('@douyinfe/semi-ui', () => ({
    Button: ({ children, onClick, disabled, loading, ...rest }: any) => (
        <button onClick={onClick} disabled={disabled} data-loading={loading} {...rest}>
            {children}
        </button>
    ),
    Modal: ({ visible, children, onOk, onCancel, confirmLoading }: any) => 
        visible ? (
            <div data-testid="save-modal">
                {children}
                <button 
                    data-testid="modal-ok" 
                    onClick={onOk} 
                    disabled={confirmLoading}
                >
                    确定
                </button>
                <button data-testid="modal-cancel" onClick={onCancel}>
                    取消
                </button>
            </div>
        ) : null,
    Input: ({ value, onChange, placeholder }: any) => (
        <input
            data-testid="summary-title-input"
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            placeholder={placeholder}
        />
    ),
    Toast: {
        warning: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe('AgentChatPanel handleKeyDown (Bug1: IME 组字回车不发送)', () => {
    it('IME 组字中 (isComposing=true) 按 Enter 不触发 onSend', () => {
        const onSend = vi.fn();
        rtlRender(<AgentChatPanel messages={[]} onSend={onSend} sending={false} />);
        const textarea = screen.getByPlaceholderText(/回车发送/);
        fireEvent.change(textarea, { target: { value: '你好' } });
        // fireEvent.keyDown 的第二参会同时写到 nativeEvent 上
        fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('非组字 (isComposing=false) 按 Enter 正常触发 onSend', () => {
        const onSend = vi.fn();
        rtlRender(<AgentChatPanel messages={[]} onSend={onSend} sending={false} />);
        const textarea = screen.getByPlaceholderText(/回车发送/);
        fireEvent.change(textarea, { target: { value: '你好' } });
        fireEvent.keyDown(textarea, { key: 'Enter', isComposing: false });
        expect(onSend).toHaveBeenCalledWith('你好');
    });
});

describe('AgentChatPanel - Save as Summary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('无 assistant 产出时不渲染保存按钮', async () => {
        const onSend = vi.fn();
        const onSaveAsSummary = vi.fn();
        const { Toast } = await import('@douyinfe/semi-ui');
        
        // 组件实际行为是 canSave = hasAssistantOutput() && onSaveAsSummary
        // 所以无 assistant 产出时,按钮根本不渲染
        rtlRender(
            <AgentChatPanel
                messages={[{ role: 'user', content: '你好' }]}
                onSend={onSend}
                sending={false}
                onSaveAsSummary={onSaveAsSummary}
            />
        );

        // 按钮不应该渲染
        expect(screen.queryByText('保存为总结')).not.toBeInTheDocument();
        // Toast.warning 不会被调用,因为按钮不存在
        expect(Toast.warning).not.toHaveBeenCalled();
    });

    it('有 assistant 产出时点击保存按钮应打开对话框', () => {
        const onSend = vi.fn();
        const onSaveAsSummary = vi.fn();
        
        rtlRender(
            <AgentChatPanel
                messages={[
                    { role: 'user', content: '你好' },
                    { role: 'assistant', content: '你好，我是助手' },
                ]}
                onSend={onSend}
                sending={false}
                onSaveAsSummary={onSaveAsSummary}
            />
        );

        const saveButton = screen.getByText('保存为总结');
        fireEvent.click(saveButton);

        expect(screen.getByTestId('save-modal')).toBeInTheDocument();
        expect(screen.getByTestId('summary-title-input')).toBeInTheDocument();
    });

    it('空标题时点击确定应显示警告', async () => {
        const onSend = vi.fn();
        const onSaveAsSummary = vi.fn();
        const { Toast } = await import('@douyinfe/semi-ui');
        
        rtlRender(
            <AgentChatPanel
                messages={[
                    { role: 'user', content: '你好' },
                    { role: 'assistant', content: '你好，我是助手' },
                ]}
                onSend={onSend}
                sending={false}
                onSaveAsSummary={onSaveAsSummary}
            />
        );

        // 打开对话框
        const saveButton = screen.getByText('保存为总结');
        fireEvent.click(saveButton);

        // 验证对话框已打开
        expect(screen.getByTestId('save-modal')).toBeInTheDocument();
        
        // 不输入标题,直接点确定
        const okButton = screen.getByTestId('modal-ok');
        fireEvent.click(okButton);
        
        // 验证警告被调用,onSaveAsSummary 未被调用
        expect(Toast.warning).toHaveBeenCalled();
        expect(onSaveAsSummary).not.toHaveBeenCalled();
    });

    it('保存成功后应关闭对话框并清空标题', async () => {
        const onSend = vi.fn();
        const onSaveAsSummary = vi.fn().mockResolvedValue(true);
        
        rtlRender(
            <AgentChatPanel
                messages={[
                    { role: 'user', content: '你好' },
                    { role: 'assistant', content: '你好，我是助手' },
                ]}
                onSend={onSend}
                sending={false}
                onSaveAsSummary={onSaveAsSummary}
            />
        );

        // 打开对话框
        const saveButton = screen.getByText('保存为总结');
        fireEvent.click(saveButton);

        // 验证对话框已打开
        expect(screen.getByTestId('save-modal')).toBeInTheDocument();
        
        // 输入标题
        const titleInput = screen.getByTestId('summary-title-input');
        fireEvent.change(titleInput, { target: { value: '测试总结' } });
        expect(titleInput).toHaveValue('测试总结');
        
        // 点击确定
        const okButton = screen.getByTestId('modal-ok');
        fireEvent.click(okButton);
        
        // 等待异步操作完成
        await waitFor(() => {
            // 验证 onSaveAsSummary 被正确调用
            // WEB-03: 第二参是绑定的 request_id；本用例没发过消息，故为 undefined。
            expect(onSaveAsSummary).toHaveBeenCalledWith('测试总结', undefined);
            expect(onSaveAsSummary).toHaveBeenCalledTimes(1);
        });
        
        // 保存成功后,对话框应该关闭
        await waitFor(() => {
            expect(screen.queryByTestId('save-modal')).not.toBeInTheDocument();
        });
    });

    it('保存失败后应保留对话框和已填标题', async () => {
        const onSend = vi.fn();
        const onSaveAsSummary = vi.fn().mockResolvedValue(false);
        
        rtlRender(
            <AgentChatPanel
                messages={[
                    { role: 'user', content: '你好' },
                    { role: 'assistant', content: '你好，我是助手' },
                ]}
                onSend={onSend}
                sending={false}
                onSaveAsSummary={onSaveAsSummary}
            />
        );

        // 打开对话框
        const saveButton = screen.getByText('保存为总结');
        fireEvent.click(saveButton);

        // 验证对话框已打开
        expect(screen.getByTestId('save-modal')).toBeInTheDocument();
        
        // 输入标题
        const titleInput = screen.getByTestId('summary-title-input');
        fireEvent.change(titleInput, { target: { value: '测试总结' } });
        expect(titleInput).toHaveValue('测试总结');
        
        // 点击确定
        const okButton = screen.getByTestId('modal-ok');
        fireEvent.click(okButton);
        
        // 等待异步操作完成
        await waitFor(() => {
            // 验证 onSaveAsSummary 被调用
            // WEB-03: 第二参是绑定的 request_id；本用例没发过消息，故为 undefined。
            expect(onSaveAsSummary).toHaveBeenCalledWith('测试总结', undefined);
            expect(onSaveAsSummary).toHaveBeenCalledTimes(1);
        });
        
        // 保存失败后,对话框应该仍然存在
        expect(screen.getByTestId('save-modal')).toBeInTheDocument();
        // 标题应该保留
        expect(titleInput).toHaveValue('测试总结');
    });
});
describe('AgentChatPanel 新会话 action', () => {
    it('不提供 onNewSession 时不渲染「新会话」按钮', () => {
        rtlRender(<AgentChatPanel messages={[]} onSend={vi.fn()} sending={false} />);
        expect(screen.queryByText('新会话')).not.toBeInTheDocument();
    });

    it('提供 onNewSession 时渲染按钮，点击触发回调', () => {
        const onNewSession = vi.fn();
        rtlRender(
            <AgentChatPanel messages={[]} onSend={vi.fn()} sending={false} onNewSession={onNewSession} />,
        );
        const btn = screen.getByText('新会话');
        fireEvent.click(btn);
        expect(onNewSession).toHaveBeenCalledTimes(1);
    });

    it('发送中 (sending=true) 禁用「新会话」按钮', () => {
        const onNewSession = vi.fn();
        rtlRender(
            <AgentChatPanel messages={[]} onSend={vi.fn()} sending onNewSession={onNewSession} />,
        );
        const btn = screen.getByText('新会话') as HTMLButtonElement;
        expect(btn).toBeDisabled();
    });
});

// DAP-271 finding 6:展开「查看生成过程」时透传 agent 业务 session_id(与信封设备 session 分属两条路径)。
describe('AgentChatPanel — agent_process_viewed.session_id (DAP-271 finding 6)', () => {
    it('展开边发 smart_summary_agent_process_viewed 并带业务 session_id', async () => {
        const { Dap } = await import('@octo/base');
        const { act } = await import('@testing-library/react');
        const track = vi.spyOn(Dap.shared, 'track').mockImplementation(() => undefined);
        const ref = React.createRef<any>();
        const { container } = rtlRender(<AgentChatPanel ref={ref} messages={[{ role: 'assistant', content: 'hi' }] as any} onSend={vi.fn()} sending={false} useStream sessionId="sess-xyz" />);
        // 生成过程面板只在最后一条 assistant 消息下渲染;造出步骤并折叠(仅展开边发事件)。
        act(() => ref.current.setState({ progressSteps: [{ phase: 'search' }], processExpanded: false }));
        const toggle = container.querySelector('.agent-chat-process-toggle') as HTMLElement;
        expect(toggle, '生成过程折叠开关应已渲染').toBeTruthy();
        fireEvent.click(toggle);
        const viewed = track.mock.calls.find(([n]) => n === 'smart_summary_agent_process_viewed');
        expect(viewed?.[1]).toMatchObject({ step_count: 1, session_id: 'sess-xyz' });
        track.mockRestore();
    });
});
