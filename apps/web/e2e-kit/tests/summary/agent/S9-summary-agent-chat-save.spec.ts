/* eslint-disable no-undef -- e2e code runs in Node */
/**
 * spec: e2e-kit/case-specs/summary/agent/S9-summary-agent-chat-save.md
 *
 * S9: Summary Agent 总结 chat → 保存为总结 → 详情.
 */
import { test, expect } from "../../../fixtures-authed";
import { registerS9SummaryAgentChatSave } from "../../../msw-handlers/s9-summary-agent-chat-save";
import { startRequestMonitor, sanityCheck } from "../../../_lib/sanity";

const sanityConfig = {
  // CI leak target plus legacy mock host marker; workflow proxy-error grep remains the fail-closed guard.
  realHosts: ["127.0.0.1:9", "mock.e2e.local"],
  apiPrefixRe: /^\/(api|summary\/api)(\/|$)/,
  loginPathRe: /\/login(\?|$)/,
};

test.describe("@S9 @p0 @summary @agent @summary-agent @summary-create @summary-detail S9 — Summary Agent 总结保存主流程", () => {
  test("Agent 对话产出保存为总结后进入详情", async ({ authedPage }) => {
    await registerS9SummaryAgentChatSave(authedPage);
    const ctx = startRequestMonitor(authedPage, sanityConfig);

    await authedPage.getByRole("button", { name: "智能总结" }).click();
    await expect(authedPage.getByText("暂无总结记录")).toBeVisible({ timeout: 15_000 });
    await authedPage.getByRole("button", { name: "创建第一份总结" }).click();

    await expect(authedPage.getByText("邀请同事一起总结信息")).toBeVisible({ timeout: 15_000 });
    await authedPage.getByRole("button", { name: "Agent 总结" }).click();

    await expect(
      authedPage.getByText("你好，我是总结助手，想总结什么尽管告诉我。")
    ).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByRole("button", { name: "新会话" })).toBeVisible();
    await expect(authedPage.getByRole("button", { name: "保存为总结" })).toHaveCount(0);

    await authedPage
      .getByPlaceholder("输入你的问题，回车发送（Shift+Enter 换行）")
      .fill("S9 总结项目风险和下周计划");
    await authedPage.getByRole("button", { name: "发送" }).click();

    await expect(authedPage.getByText("S9 总结项目风险和下周计划")).toBeVisible();
    await expect(authedPage.getByText("S9 Agent 已整理项目风险和下周计划")).toBeVisible({
      timeout: 15_000,
    });
    await expect(authedPage.getByRole("button", { name: "保存为总结" })).toBeVisible();

    await authedPage.getByRole("button", { name: "保存为总结" }).click();
    const saveDialog = authedPage.getByRole("dialog", { name: "保存为总结" });
    await expect(saveDialog).toBeVisible();
    await saveDialog.getByPlaceholder("为这份总结起个标题").fill("S9 Agent 风险总结");
    await saveDialog.getByText("确定", { exact: true }).click();

    await expect(authedPage.getByText("AI 总结已保存")).toBeVisible({ timeout: 15_000 });
    await expect(
      authedPage.locator(".summary-detail-title", { hasText: "S9 Agent 风险总结" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByText("AI 摘要")).toBeVisible();
    await expect(authedPage.getByText("S9 Agent 总结已保存")).toBeVisible();
    await expect(authedPage.getByText("风险项需要提前暴露")).toBeVisible();
    await expect(authedPage.getByText("创建失败")).toHaveCount(0);
    await expect(authedPage.getByText("加载失败")).toHaveCount(0);

    await sanityCheck(authedPage, ctx);
  });
});
