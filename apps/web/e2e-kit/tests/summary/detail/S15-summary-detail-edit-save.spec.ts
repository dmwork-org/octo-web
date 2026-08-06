/* eslint-disable no-undef -- e2e code runs in Node */
/**
 * spec: e2e-kit/case-specs/summary/detail/S15-summary-detail-edit-save.md
 *
 * S15: Summary 详情编辑取消 / 保存.
 */
import { test, expect } from "../../../fixtures-authed";
import { registerS15SummaryDetailEditSave } from "../../../msw-handlers/s15-summary-detail-edit-save";
import { startRequestMonitor, sanityCheck } from "../../../_lib/sanity";

const sanityConfig = {
  realHosts: ["127.0.0.1:9", "mock.e2e.local"],
  apiPrefixRe: /^\/(api|summary\/api)(\/|$)/,
  loginPathRe: /\/login(\?|$)/,
};

test.describe("@S15 @p1 @summary @detail @summary-detail @summary-edit S15 — Summary 详情编辑保存", () => {
  test("编辑取消不保存，再编辑保存后正文更新", async ({ authedPage }) => {
    await registerS15SummaryDetailEditSave(authedPage);
    const ctx = startRequestMonitor(authedPage, sanityConfig);

    await authedPage.getByRole("button", { name: "智能总结" }).click();
    await expect(authedPage.getByText("S15 可编辑总结")).toBeVisible({ timeout: 15_000 });
    await authedPage.getByText("S15 可编辑总结").click();

    await expect(authedPage.locator(".summary-detail-title", { hasText: "S15 可编辑总结" })).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByText("S15 原始正文内容")).toBeVisible();

    await authedPage.locator(".summary-detail-inline-edit", { hasText: "编辑" }).click();
    const editor = authedPage.locator(".summary-editor-textarea");
    await expect(editor).toBeVisible();
    await editor.fill("## S15 可编辑总结\n\n- S15 草稿取消内容\n");
    await authedPage.locator(".summary-detail-footer-btn--cancel").click();

    await expect(authedPage.getByText("S15 原始正文内容")).toBeVisible();
    await expect(authedPage.getByText("S15 草稿取消内容")).toHaveCount(0);

    await authedPage.locator(".summary-detail-inline-edit", { hasText: "编辑" }).click();
    await expect(editor).toBeVisible();
    await editor.fill("## S15 可编辑总结\n\n- S15 已保存正文内容\n");
    await authedPage.locator(".summary-detail-footer-btn--save").click();

    await expect(authedPage.getByText("保存成功", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByText("S15 已保存正文内容")).toBeVisible({ timeout: 15_000 });
    await expect(authedPage.getByText("S15 草稿取消内容")).toHaveCount(0);
    await expect(authedPage.getByText("加载失败")).toHaveCount(0);

    await sanityCheck(authedPage, ctx);
  });
});
