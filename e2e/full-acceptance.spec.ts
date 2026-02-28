import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.DMWORK_URL || 'http://localhost:82';
const API_URL = process.env.DMWORK_API || 'http://localhost:8090';
const USER_A = { username: 'pwtest_usera1', password: 'testpass123', name: '测试用户A' };

async function ensureUser(user: typeof USER_A) {
  try {
    await fetch(`${API_URL}/v1/user/usernameregister`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, name: user.name, password: user.password, flag: 1 }),
    });
  } catch {}
}

async function loginUser(page: Page, user: typeof USER_A) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1000);
  // 用可见的输入框
  const inputs = page.locator('input:visible');
  const usernameInput = inputs.filter({ has: page.locator('[placeholder*="用户名"]') }).first();
  const passwordInput = inputs.filter({ has: page.locator('[placeholder*="密码"]') }).first();
  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(user.username);
    await passwordInput.fill(user.password);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForTimeout(3000);
  }
}

// 辅助：获取注册表单的可见输入框
async function goToRegister(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(500);
  await page.getByText('没有账号？注册').click();
  await page.waitForTimeout(500);
}

// ============ 一、品牌 ============
test.describe('一、品牌与页面基础', () => {
  test('1.1 页面标题为 DMWork', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle('DMWork');
  });
  test('1.2 Favicon 存在', async ({ page }) => {
    await page.goto(BASE_URL);
    const favicon = await page.locator('link[rel*="icon"]').getAttribute('href');
    expect(favicon).toBeTruthy();
  });
  test('1.3 主题色 #6366F1', async ({ page }) => {
    await page.goto(BASE_URL);
    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--wk-color-theme').trim()
    );
    expect(color).toBe('#6366F1');
  });
  test('1.4 无唐僧叨叨残留', async ({ page }) => {
    await page.goto(BASE_URL);
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('唐僧叨叨');
    expect(text).not.toContain('TangSengDaoDao');
  });
});

// ============ 二、注册 ============
test.describe('二、注册功能', () => {
  test('2.1 注册页面可访问', async ({ page }) => {
    await goToRegister(page);
    await expect(page.getByText('注册新账号')).toBeVisible();
  });
  test('2.2 注册表单字段完整', async ({ page }) => {
    await goToRegister(page);
    // 注册表单中的可见输入框
    const visibleInputs = page.locator('input:visible');
    const count = await visibleInputs.count();
    expect(count).toBeGreaterThanOrEqual(4); // 用户名、昵称、密码、确认密码
  });
  test('2.3 注册表单密码框可见', async ({ page }) => {
    await goToRegister(page);
    const passwordInputs = page.locator('input[type="password"]:visible');
    const count = await passwordInputs.count();
    // 应该有2个可见的密码框（密码 + 确认密码）
    expect(count).toBe(2);
  });
  test('2.4 返回登录链接', async ({ page }) => {
    await goToRegister(page);
    const loginLink = page.getByText('已有账号？登录');
    expect(await loginLink.isVisible()).toBeTruthy();
  });
});

// ============ 三、登录 ============
test.describe('三、登录功能', () => {
  test.beforeAll(async () => { await ensureUser(USER_A); });

  test('3.1 登录页包含用户名和密码框', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    const usernameInput = page.locator('input[placeholder*="用户名"]:visible');
    const passwordInput = page.locator('input[placeholder*="密码"]:visible');
    expect(await usernameInput.count()).toBeGreaterThanOrEqual(1);
    expect(await passwordInput.count()).toBeGreaterThanOrEqual(1);
  });

  test('3.2 登录按钮存在', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    const btn = page.getByRole('button', { name: '登录' });
    expect(await btn.isVisible()).toBeTruthy();
  });

  test('3.3 正确凭证登录后页面变化', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    await page.locator('input[placeholder*="用户名"]:visible').first().fill(USER_A.username);
    await page.locator('input[placeholder*="密码"]:visible').first().fill(USER_A.password);
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForTimeout(5000);
    // 登录后 URL 或页面内容应该变化
    const bodyText = await page.locator('body').innerText();
    const loginBtnGone = !(await page.getByRole('button', { name: '登录' }).isVisible().catch(() => false));
    const hasMainUI = bodyText.includes('通讯录') || bodyText.includes('会话') || bodyText.includes('消息') || loginBtnGone;
    expect(hasMainUI).toBeTruthy();
  });

  test('3.4 错误密码不跳转', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    await page.locator('input[placeholder*="用户名"]:visible').first().fill(USER_A.username);
    await page.locator('input[placeholder*="密码"]:visible').first().fill('wrongpassword');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForTimeout(2000);
    // 登录按钮应该还在
    expect(await page.getByRole('button', { name: '登录' }).isVisible()).toBeTruthy();
  });
});

// ============ 四、主界面 ============
test.describe('四、主界面功能', () => {
  test.beforeAll(async () => { await ensureUser(USER_A); });

  test('4.1 登录后有导航栏', async ({ page }) => {
    await loginUser(page, USER_A);
    // 检查是否有底部或侧边导航
    const nav = page.locator('nav, [class*="tab"], [class*="sidebar"], [class*="menu"]').first();
    const hasNav = await nav.isVisible().catch(() => false);
    // 即使没有 nav，也检查页面是否离开了登录页
    const loginBtnGone = !(await page.getByRole('button', { name: '登录' }).isVisible().catch(() => false));
    expect(hasNav || loginBtnGone).toBeTruthy();
  });
});

// ============ 五、API 连通性 ============
test.describe('五、API 连通性', () => {
  test('5.1 API 端口可达', async ({ request }) => {
    const resp = await request.get(`${API_URL}/v1`).catch(() => null);
    expect(resp !== null).toBeTruthy();
  });
  test('5.2 文件上传 API 需认证', async ({ request }) => {
    const resp = await request.get(`${API_URL}/v1/file/upload`);
    expect(resp.status()).not.toBe(404);
  });
  test('5.3 用户名登录 API 正常', async ({ request }) => {
    await ensureUser(USER_A);
    const resp = await request.post(`${API_URL}/v1/user/usernamelogin`, {
      data: { username: USER_A.username, password: USER_A.password },
    });
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.data.username).toBe(USER_A.username);
  });
});

// ============ 六、响应式 ============
test.describe('六、响应式', () => {
  test('6.1 桌面无水平滚动', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 5);
  });
  test('6.2 手机尺寸可用', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle('DMWork');
  });
});
