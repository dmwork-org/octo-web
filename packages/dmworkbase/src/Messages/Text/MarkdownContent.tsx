import React, { useCallback, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "highlight.js/styles/github-dark.css";
import "./markdown.css";

export interface MentionInfo {
    name: string; // "@张三"（含@符号）
    uid: string;
}

export interface EmojiInfo {
    key: string;  // emoji 文本 key，如 "[有品位]" 或 Unicode "😀"
    url: string;  // 图片 URL
}

interface MarkdownContentProps {
    content: string;
    isSend?: boolean;
    isStreaming?: boolean;
    mentions?: MentionInfo[];
    onMentionClick?: (uid: string) => void;
    emojis?: EmojiInfo[];
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

const rehypePlugins: any[] = [
    [rehypeHighlight, { aliases: { json5: "json" }, ignoreMissing: true }],
    [rehypeSanitize, sanitizeSchema],
];

const remarkPlugins: any[] = [remarkGfm];

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
        if (i % 2 === 1) return part;
        return part
            .replace(/([^\n])\n([-*_]{3,})\n/g, "$1\n\n$2\n\n")
            .replace(/(^|\n)([-*_]{3,})(\n|$)/g, "\n\n$2\n\n")
            .replace(/\n{3,}/g, "\n\n");
    });
    return processed.join("").trim();
}

type Segment =
    | { type: "text"; content: string }
    | { type: "mention"; name: string; uid: string }
    | { type: "emoji"; key: string; url: string };

function segmentText(
    text: string,
    mentions: MentionInfo[],
    emojis: EmojiInfo[],
): Segment[] {
    if (!mentions.length && !emojis.length) {
        return [{ type: "text", content: text }];
    }

    // 合并 mention 和 emoji，按 key/name 长度降序排列（防止短 key 提前匹配）
    type Token =
        | { kind: "mention"; name: string; uid: string }
        | { kind: "emoji"; key: string; url: string };

    const tokens: Token[] = [
        ...mentions.map((m) => ({ kind: "mention" as const, name: m.name, uid: m.uid })),
        ...emojis.map((e) => ({ kind: "emoji" as const, key: e.key, url: e.url })),
    ].sort((a, b) => {
        const aLen = a.kind === "mention" ? a.name.length : a.key.length;
        const bLen = b.kind === "mention" ? b.name.length : b.key.length;
        return bLen - aLen;
    });

    const escaped = tokens.map((t) => {
        const raw = t.kind === "mention" ? t.name : t.key;
        return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });

    const regex = new RegExp(`(${escaped.join("|")})`, "g");

    const segments: Segment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
        }
        const matched = match[0];
        const token = tokens.find((t) =>
            t.kind === "mention" ? t.name === matched : t.key === matched
        )!;
        if (token.kind === "mention") {
            segments.push({ type: "mention", name: token.name, uid: token.uid });
        } else {
            segments.push({ type: "emoji", key: token.key, url: token.url });
        }
        lastIndex = match.index + matched.length;
    }
    if (lastIndex < text.length) {
        segments.push({ type: "text", content: text.slice(lastIndex) });
    }
    return segments;
}

const baseComponents: any = {
    a: ({ href, children, ...props }: any) => (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
        </a>
    ),
    pre: ({ children, ...props }: any) => (
        <div className="wk-markdown-pre-wrapper">
            <pre {...props}>{children}</pre>
        </div>
    ),
};

/**
 * 递归处理 React children，将匹配 emoji/mention 的文本节点替换为对应的 React 元素。
 * 在 ReactMarkdown 渲染后的组件树上工作，不会破坏表格等块级 markdown 结构。
 */
function processTextChildren(
    children: React.ReactNode,
    mentions: MentionInfo[],
    emojis: EmojiInfo[],
    onMentionClick?: (uid: string) => void,
    isSend?: boolean,
): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (typeof child === "string") {
            const segments = segmentText(child, mentions, emojis);
            if (segments.length === 1 && segments[0].type === "text") return child;
            return segments.map((seg, i) => {
                if (seg.type === "mention") {
                    return (
                        <span
                            key={i}
                            className={`wk-message-mention ${isSend ? "wk-message-mention-send" : "wk-message-mention-recv"}`}
                            onClick={() => seg.uid && onMentionClick?.(seg.uid)}
                        >
                            {seg.name}
                        </span>
                    );
                }
                if (seg.type === "emoji") {
                    return (
                        <span key={i} className="wk-message-text-richemoji">
                            <img alt={seg.key} src={seg.url} width={22} height={22} />
                        </span>
                    );
                }
                return seg.content;
            });
        }
        if (React.isValidElement(child) && (child.props as any).children != null) {
            return React.cloneElement(
                child as React.ReactElement<any>,
                {},
                processTextChildren((child.props as any).children, mentions, emojis, onMentionClick, isSend),
            );
        }
        return child;
    });
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
    content,
    isSend = false,
    isStreaming,
    mentions = [],
    onMentionClick,
    emojis = [],
}) => {
    const normalized = useMemo(() => normalizeContent(content), [content]);

    // Stabilize mentions/emojis references: only swap when actual content changes.
    // Parent re-renders triggered by scroll events create new array instances with
    // the same content; without this the components useMemo below would invalidate
    // every scroll, causing ReactMarkdown to unmount/remount emoji <img> elements
    // and produce a visible flicker (especially noticeable with DevTools open).
    const mentionsJson = JSON.stringify(mentions);
    const stableMentions = useRef(mentions);
    const prevMentionsJson = useRef(mentionsJson);
    if (mentionsJson !== prevMentionsJson.current) {
        prevMentionsJson.current = mentionsJson;
        stableMentions.current = mentions;
    }

    const emojisJson = JSON.stringify(emojis);
    const stableEmojis = useRef(emojis);
    const prevEmojisJson = useRef(emojisJson);
    if (emojisJson !== prevEmojisJson.current) {
        prevEmojisJson.current = emojisJson;
        stableEmojis.current = emojis;
    }

    // Stable callback: always calls the latest onMentionClick without producing
    // a new function reference on each render.
    const onMentionClickLatest = useRef(onMentionClick);
    onMentionClickLatest.current = onMentionClick;
    const stableOnMentionClick = useCallback((uid: string) => {
        onMentionClickLatest.current?.(uid);
    }, []);

    const hasTokens = stableMentions.current.length > 0 || stableEmojis.current.length > 0;

    const components = useMemo(() => {
        if (!hasTokens) return baseComponents;
        const process = (children: React.ReactNode) =>
            processTextChildren(children, stableMentions.current, stableEmojis.current, stableOnMentionClick, isSend);
        const wrap = (Tag: string) => ({ node, children, ...props }: any) =>
            React.createElement(Tag, props, process(children));
        return {
            ...baseComponents,
            p: wrap("p"),
            td: wrap("td"),
            th: wrap("th"),
            li: wrap("li"),
            h1: wrap("h1"),
            h2: wrap("h2"),
            h3: wrap("h3"),
            h4: wrap("h4"),
            h5: wrap("h5"),
            h6: wrap("h6"),
        };
    }, [hasTokens, stableMentions.current, stableEmojis.current, stableOnMentionClick, isSend]);

    return (
        <div className={`wk-markdown ${isSend ? "wk-markdown-send" : "wk-markdown-recv"}`}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={components}
            >
                {normalized}
            </ReactMarkdown>
            {isStreaming && <span className="wk-stream-cursor" />}
        </div>
    );
};

export default MarkdownContent;
