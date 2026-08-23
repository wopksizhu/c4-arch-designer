import { test, expect, type Page } from '@playwright/test';

const uniq = () => 'e2e-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
let createdProjects: number[] = [];

test.beforeEach(() => {
  createdProjects = [];
});
test.afterEach(async ({ request }) => {
  for (const id of createdProjects) {
    await request.delete(`/api/projects/${id}`).catch(() => {});
  }
});

// 新建项目并进入模型页，返回项目 id（登记到清理列表）
async function newProject(page: Page) {
  const name = uniq();
  await page.goto('/');
  await page.getByPlaceholder(/项目名称/).fill(name);
  await page.getByRole('button', { name: '新建' }).click();
  await expect(page.getByText(name)).toBeVisible();
  const m = page.url().match(/\/project\/(\d+)/);
  if (m) createdProjects.push(Number(m[1]));
  return name;
}

test('创建项目并进入模型页', async ({ page }) => {
  const name = await newProject(page);
  await expect(page.getByRole('button', { name: '+ Software System' })).toBeVisible();
});

test('添加软件系统并在画布显示', async ({ page }) => {
  await newProject(page);
  await page.getByRole('button', { name: '+ Software System' }).click();
  await expect(page.getByText('New Software System')).toBeVisible();
});

test('元素块展开/折叠：添加子容器→收起→展开', async ({ page }) => {
  await newProject(page);
  await page.getByRole('button', { name: '+ Software System' }).click();
  await expect(page.getByText('New Software System')).toBeVisible();
  // 系统尚无子元素 → 点「+ 添加子元素」添加容器（会自动展开父级）
  await page.locator('.c4-drill').first().click();
  await expect(page.getByText('New Container')).toBeVisible();
  // 收起系统 → 子元素隐藏
  await page.locator('.c4-toggle').first().click();
  await expect(page.getByText('New Container')).toBeHidden();
  // 再展开 → 子元素显示
  await page.locator('.c4-toggle').first().click();
  await expect(page.getByText('New Container')).toBeVisible();
});

test('需求页：新增需求并关联容器，追溯矩阵可见', async ({ page }) => {
  await newProject(page);
  // 建一个系统 + 一个容器
  await page.getByRole('button', { name: '+ Software System' }).click();
  await page.locator('.c4-drill').first().click();
  // 切到需求页
  await page.getByRole('button', { name: '需求' }).click();
  await page.getByPlaceholder('标题').fill('E2E 需求');
  await page.getByRole('button', { name: '添加' }).click();
  await expect(page.getByText('E2E 需求').first()).toBeVisible();
  // 在需求卡片的「选择元素」里关联容器（第一个容器）
  const sel = page.locator('select').filter({ hasText: '选择元素' }).first();
  await sel.selectOption({ index: 1 });
  await expect(page.getByText(/已关联/).first()).toBeVisible();
  // 切到追溯矩阵，应看到该需求
  await page.getByRole('button', { name: '追溯矩阵' }).click();
  await expect(page.getByText('E2E 需求')).toBeVisible();
});

test('左侧导航：在各模块间切换', async ({ page }) => {
  await newProject(page);
  for (const label of ['需求', '原型', '追溯矩阵', '影响分析', 'AI 与导出']) {
    await page.getByRole('button', { name: label }).click();
  }
  await page.getByRole('button', { name: '画布' }).click();
  await expect(page.getByRole('button', { name: '+ Software System' })).toBeVisible();
});
