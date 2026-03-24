import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "highlight.js/styles/github-dark.css";
import "./markdown.css";

interface MarkdownContentProps {
    content: string;
    isSend?: boolean;
    isStreaming?: boolean;
}

/**
 * 在 GitHub 默认白名单基础上，追加 highlight.js 需要的 class 属性。
 * 执行顺序：rehypeHighlight 先着色（加 hljs-* className），
 * rehypeSanitize 最后兜底清洗——白名单里的 hljs-* / language-* 才真正生效。
 * 注意：react-markdown 的输入是 Markdown 字符串，remark 直接解析成安全 AST，
 * 不存在注入 HTML 的机会（未开启 allowDangerousHtml），所以 highlight 先跑不会引入风险。
 */
const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        // 放行代码块的 language-* class（highlight.js 加的）
        code: [
            ...(defaultSchema.attributes?.code ?? []),
            ["className", /^language-/, /^hljs/],
        ],
        // 放行 span 上的 hljs-* class（语法高亮 token）
        span: [
            ...(defaultSchema.attributes?.span ?? []),
            ["className", /^hljs/],
        ],
    },
};

/**
 * 预处理 Markdown 内容：
 * 把独占一行的 --- / === 补充前后空行，避免被解析成 setext 标题（h2/h1）。
 * 跳过 fenced code block（```...```）内的内容，避免误处理 YAML 等代码中的分隔线。
 */
function normalizeContent(raw: string): string {
    // 把字符串按 fenced code block 切分：
    // 奇数索引 = 代码块内容（保持原样），偶数索引 = 普通文本（需要处理）
    const parts = raw.split(/(```[\s\S]*?```)/g);

    const processed = parts.map((part, i) => {
        // 奇数段是代码块，原样返回
        if (i % 2 === 1) return part;

        // 偶数段是普通文本，跑分隔线补空行逻辑
        return part
            .replace(/([^\n])\n([-*_]{3,})\n/g, "$1\n\n$2\n\n")
            .replace(/(^|\n)([-*_]{3,})(\n|$)/g, "\n\n$2\n\n")
            .replace(/\n{3,}/g, "\n\n");
    });

    return processed.join("").trim();
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, isSend, isStreaming }) => {
    const normalized = useMemo(() => normalizeContent(content), [content]);
    return (
        <div className={`wk-markdown ${isSend ? "wk-markdown-send" : "wk-markdown-recv"}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                    // highlight 先着色，sanitize 最后兜底——白名单 hljs-* class 才真正有效
                    rehypeHighlight,
                    [rehypeSanitize, sanitizeSchema],
                ]}
                components={{
                    a: ({ href, children, ...props }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {children}
                        </a>
                    ),
                    pre: ({ children, ...props }) => (
                        <div className="wk-markdown-pre-wrapper">
                            <pre {...props}>{children}</pre>
                        </div>
                    ),
                }}
            >
                {normalized}
            </ReactMarkdown>
            {isStreaming && <span className="wk-stream-cursor" />}
        </div>
    );
};

export default MarkdownContent;
