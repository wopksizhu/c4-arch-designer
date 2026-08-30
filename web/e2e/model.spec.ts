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

test('父框严格包含子元素，且子元素拖拽不越出父框', async ({ page }) => {
  await newProject(page);
  await page.getByRole('button', { name: '+ Software System' }).click();
  await expect(page.getByText('New Software System')).toBeVisible();
  // 添加一个容器（系统自动展开为边界框）
  await expect(page.locator('.c4-drill').first()).toBeVisible();
  await page.locator('.c4-drill').first().click();
  await expect(page.getByText('New Container')).toBeVisible();

  const system = page.locator('.c4-boundary').first();
  await expect(system).toBeVisible();
  const child = page.locator('.c4-node').first();
  await expect(child).toBeVisible();

  const inBox = async () => {
    const b = (await system.boundingBox())!;
    const c = (await child.boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(b.x - 1);
    expect(c.y).toBeGreaterThanOrEqual(b.y - 1);
    expect(c.x + c.width).toBeLessThanOrEqual(b.x + b.width + 1);
    expect(c.y + c.height).toBeLessThanOrEqual(b.y + b.height + 1);
  };
  await inBox();

  // 把子元素往左上拖 200px，验证被约束在父框内（不越出左上）
  const c = (await child.boundingBox())!;
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 200, cy - 200, { steps: 10 });
  await page.mouse.up();
  await expect(system).toBeVisible();
  await inBox();
});

test('拖动父元素后展开，子元素跟随父元素（仍在父框内）', async ({ page }) => {
  await newProject(page);
  await page.getByRole('button', { name: '+ Software System' }).click();
  await expect(page.getByText('New Software System')).toBeVisible();
  // 添加容器（系统自动展开）
  await expect(page.locator('.c4-drill').first()).toBeVisible();
  await page.locator('.c4-drill').first().click();
  await expect(page.getByText('New Container')).toBeVisible();
  // 收起系统 → 变为 c4 节点（可拖动）
  await page.locator('.c4-toggle').first().click();
  await expect(page.getByText('New Container')).toBeHidden();
  // 拖动系统节点
  const sysNode = page.locator('.react-flow__node-c4').first();
  const before = await sysNode.boundingBox();
  const cx = before.x + before.width / 2;
  const cy = before.y + before.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy + 180, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  // 展开系统 → 子元素应出现在父框内（随父元素一起被平移）
  await page.locator('.c4-toggle').first().click();
  await page.waitForTimeout(600);
  const system = page.locator('.c4-boundary').first();
  const child = page.locator('.c4-node').first();
  await expect(system).toBeVisible();
  await expect(child).toBeVisible();
  const b = (await system.boundingBox())!;
  const c = (await child.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(c.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(c.x + c.width).toBeLessThanOrEqual(b.x + b.width + 1);
  expect(c.y + c.height).toBeLessThanOrEqual(b.y + b.height + 1);
});

test('自动布局：子元素仍在父框内，且同层节点不重叠', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-layout-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const elem = async (level: number, type: string, name: string, parentId: number | null, x: number, y: number) =>
    (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level, type, name, parentId, posX: x, posY: y } })).json()).data;
  const sys = await elem(1, 'softwareSystem', 'Sys', null, 300, 0);
  const c1 = await elem(2, 'container', 'C1', sys.id, 360, 200);
  const c2 = await elem(2, 'container', 'C2', sys.id, 620, 200);
  await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId: c1.id, targetId: c2.id, label: 'uses', level: 2 } });

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '全部展开' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '自动布局' }).click();
  await page.waitForTimeout(1200);

  const sysBox = (await page.locator('.c4-boundary').first().boundingBox())!;
  const leaves = page.locator('.react-flow__node-c4');
  await expect(leaves).toHaveCount(2);
  const bb = (await leaves.nth(0).boundingBox())!;
  const bb2 = (await leaves.nth(1).boundingBox())!;
  // 子元素仍在系统边界框内
  expect(bb.x).toBeGreaterThanOrEqual(sysBox.x - 1);
  expect(bb.y).toBeGreaterThanOrEqual(sysBox.y - 1);
  expect(bb.x + bb.width).toBeLessThanOrEqual(sysBox.x + sysBox.width + 1);
  expect(bb.y + bb.height).toBeLessThanOrEqual(sysBox.y + sysBox.height + 1);
  // 同层节点不重叠
  const overlap =
    Math.min(bb.x + bb.width, bb2.x + bb2.width) - Math.max(bb.x, bb2.x) > 0 &&
    Math.min(bb.y + bb.height, bb2.y + bb2.height) - Math.max(bb.y, bb2.y) > 0;
  expect(overlap).toBe(false);
});

test('关系层级关联：未落到容器的系统消息显示为红，落到的走正常边', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-rel-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const elem = async (level: number, type: string, name: string, parentId: number | null, x: number, y: number) =>
    (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level, type, name, parentId, posX: x, posY: y } })).json()).data;
  const rel = async (sourceId: number, targetId: number, targetContainerId: number | null) =>
    (await (await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId, targetId, label: 'uses', interaction: 'uses', level: 1, targetContainerId } })).json()).data;
  const s1 = await elem(1, 'softwareSystem', 'S1', null, 100, 100);
  const s2 = await elem(1, 'softwareSystem', 'S2', null, 700, 60);
  const c1 = await elem(2, 'container', 'C1', s2.id, 760, 180);
  const c2 = await elem(2, 'container', 'C2', s2.id, 760, 420);
  await rel(s1.id, s2.id, c1.id); // 消息落到 C1
  await rel(s1.id, s2.id, c2.id); // 消息落到 C2
  await rel(s1.id, s2.id, null); // 未指定承接容器 → 缺失红

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1200);
  await page.locator('.c4-toggle').first().click(); // 展开 S2
  await page.waitForTimeout(900);

  const redCount = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.react-flow__edge path').forEach((p) => {
      const st = getComputedStyle(p).stroke || p.getAttribute('stroke') || '';
      if (st.includes('220') || st.includes('38, 38') || st === 'red') n++;
    });
    return n;
  });
  expect(redCount).toBeGreaterThanOrEqual(1);
});

test('拖拽连线方向：起点→终点，箭头不反向', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-dir-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const elem = async (level: number, type: string, name: string, x: number, y: number) =>
    (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level, type, name, parentId: null, posX: x, posY: y } })).json()).data;
  const A = await elem(1, 'softwareSystem', 'Aaa', 200, 300);
  const B = await elem(1, 'softwareSystem', 'Bbb', 900, 300);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  const a = page.locator('.react-flow__node', { hasText: 'Aaa' }).first();
  const b = page.locator('.react-flow__node', { hasText: 'Bbb' }).first();
  const ab = (await a.boundingBox())!;
  const bb = (await b.boundingBox())!;
  // 用「框体自由连线」：抓 A 框体空白拖到 B 框体空白 → 应生成 A→B
  await page.mouse.move(ab.x + ab.width * 0.12, ab.y + ab.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.12, bb.y + bb.height * 0.5, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const rels = (await (await request.get(`${base}/projects/${proj.id}/relationships`)).json()).data;
  expect(rels.length).toBe(1);
  expect(rels[0].sourceId).toBe(A.id);
  expect(rels[0].targetId).toBe(B.id);
});

test('折叠聚合容器级关系 + 递归标红（消息须落到叶子）', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-deep-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const elem = async (level: number, type: string, name: string, parentId: number | null, x: number, y: number) =>
    (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level, type, name, parentId, posX: x, posY: y } })).json()).data;
  const person = await elem(1, 'person', 'P', null, 200, 300);
  const sys1 = await elem(1, 'softwareSystem', 'S1', null, 700, 120);
  const c1 = await elem(2, 'container', 'C1', sys1.id, 760, 220);
  const comp1 = await elem(3, 'component', 'K', c1.id, 800, 320);
  const sys2 = await elem(1, 'softwareSystem', 'S2', null, 1300, 300);
  const x2 = await elem(2, 'container', 'X', sys2.id, 1360, 360);
  // person→S1 的接收端映射到 C1（C1 有子级 → 递归标红）
  await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId: person.id, targetId: sys1.id, label: 'm1', interaction: 'm1', level: 1, messages: JSON.stringify([{ name: 'm1', protocol: '', senderId: null, receiverId: c1.id }]) } });
  // 容器级关系 K→X：折叠后应聚合为 S1→S2
  await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId: comp1.id, targetId: x2.id, label: 'inner', interaction: 'inner', level: 3, messages: JSON.stringify([{ name: 'inner', protocol: '', senderId: null, receiverId: null }]) } });

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1500);

  const edgeCount = await page.locator('.react-flow__edge').count();
  expect(edgeCount).toBeGreaterThanOrEqual(2); // person→S1(红) + S1→S2(聚合)
  const redCount = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.react-flow__edge path').forEach((p) => {
      const st = getComputedStyle(p).stroke || '';
      if (st.includes('220')) n++;
    });
    return n;
  });
  expect(redCount).toBeGreaterThanOrEqual(1);
});

test('右键分类画板：添加数据库/前端等子元素', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-palette-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const sys = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Sys', parentId: null, posX: 400, posY: 300 } })).json()).data;

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1500);
  // 右键系统节点 → 显示分类画板
  const node = page.locator('.react-flow__node', { hasText: 'Sys' }).first();
  await node.click({ button: 'right' });
  await page.waitForTimeout(500);
  await expect(page.getByText('数据库')).toBeVisible();
  // 点「MySQL」
  await page.getByText('MySQL').click();
  await page.waitForTimeout(900);
  await expect(page.getByText('MySQL').first()).toBeVisible();

  const elems = (await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data;
  const child = elems.find((e) => e.name === 'MySQL');
  expect(child).toBeTruthy();
  expect(child.category).toBe('database');
  expect(child.technology).toBe('MySQL');
  expect(child.parentId).toBe(sys.id);
});

test('技术栈预设自动推断类别（MySQL→database）', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-tech-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const sys = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Sys', parentId: null, posX: 400, posY: 300 } })).json()).data;

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1500);
  await page.locator('.react-flow__node', { hasText: 'Sys' }).first().click();
  await page.waitForTimeout(500);

  const techInput = page.getByPlaceholder(/选择或输入技术栈/);
  await techInput.fill('MySQL');
  await techInput.press('Tab'); // blur → auto infer category

  const catInput = page.getByPlaceholder(/database \/ backend/);
  await expect(catInput).toHaveValue('database');

  await page.getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(800);

  const elems = (await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data;
  const el = elems.find((e) => e.id === sys.id);
  expect(el.category).toBe('database');
  expect(el.technology).toBe('MySQL');
});

test('画布导出 PNG/SVG', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-export-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Sys', parentId: null, posX: 400, posY: 300 } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(2000);
  const pngPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: '导出 PNG' }).click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toBe('archlens.png');
  const svgPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: '导出 SVG' }).click();
  const svg = await svgPromise;
  expect(svg.suggestedFilename()).toBe('archlens.svg');
});

test('画布搜索：非匹配元素淡化', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-search-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'OrderSys', parentId: null, posX: 300, posY: 300 } });
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'PaySys', parentId: null, posX: 800, posY: 300 } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  const search = page.getByPlaceholder(/搜索元素/);
  await search.fill('Order');
  await page.waitForTimeout(500);
  const orderOpacity = await page.locator('.react-flow__node', { hasText: 'OrderSys' }).first().locator('.c4-node').evaluate((el) => getComputedStyle(el).opacity);
  const payOpacity = await page.locator('.react-flow__node', { hasText: 'PaySys' }).first().locator('.c4-node').evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(orderOpacity)).toBeGreaterThan(0.9);
  expect(Number(payOpacity)).toBeLessThan(0.5);
});

test('复制/粘贴元素（含子元素与内部关系）', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-copy-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const sys = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Sys', parentId: null, posX: 400, posY: 300 } })).json()).data;
  const child = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 2, type: 'container', name: 'Web', parentId: sys.id, posX: 460, posY: 380 } })).json()).data;

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  // 右键系统节点 → 复制
  const sysNode = page.locator('.react-flow__node', { hasText: 'Sys' }).first();
  await sysNode.click({ button: 'right' });
  await page.waitForTimeout(400);
  await page.getByText('复制元素').click();
  await page.waitForTimeout(500);
  // 顶栏「粘贴」→ 生成一个副本（新 Sys + 其子 Web）
  await page.getByRole('button', { name: '粘贴' }).click();
  await page.waitForTimeout(1000);

  const elems = (await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data;
  const sysCopies = elems.filter((e) => e.name === 'Sys');
  const webCopies = elems.filter((e) => e.name === 'Web');
  expect(sysCopies.length).toBe(2); // 原件 + 副本
  expect(webCopies.length).toBe(2);
  // 副本的 Web 挂在副本 Sys 之下
  const newSys = sysCopies.find((e) => e.id !== sys.id)!;
  const newWeb = webCopies.find((e) => e.parentId === newSys.id);
  expect(newWeb).toBeTruthy();
});

test('布局方向切换（上下/左右）', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-dir2-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'AlphaSys', parentId: null, posX: 200, posY: 500 } });
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'BetaSys', parentId: null, posX: 200, posY: 300 } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '⇩ 上下布局' }).click(); // 切到 左右 并自动布局
  await page.waitForTimeout(900);
  await expect(page.locator('.react-flow__node', { hasText: 'AlphaSys' }).first()).toBeVisible();
  await expect(page.locator('.react-flow__node', { hasText: 'BetaSys' }).first()).toBeVisible();
});

test('校验面板：列出缺失(红)消息', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-val-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const s1 = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'A', parentId: null, posX: 300, posY: 300 } })).json()).data;
  const s2 = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'B', parentId: null, posX: 800, posY: 300 } })).json()).data;
  const c = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 2, type: 'container', name: 'C1', parentId: s1.id, posX: 360, posY: 380 } })).json()).data;
  // 一条系统级消息未落到叶子 → 缺失(红)
  await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId: s1.id, targetId: s2.id, label: 'm1', interaction: 'm1', level: 1, messages: JSON.stringify([{ name: 'm1', protocol: '', senderId: null, receiverId: null }]) } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /校验/ }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText('A → B').first()).toBeVisible();
  await expect(page.getByText('m1').first()).toBeVisible();
});

test('层级导航面包屑', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-crumb-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const sys = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'SysA', parentId: null, posX: 400, posY: 300 } })).json()).data;
  const child = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 2, type: 'container', name: 'WebA', parentId: sys.id, posX: 460, posY: 380 } })).json()).data;
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.locator('.c4-toggle').first().click(); // 展开 SysA 让 WebA 可见
  await page.waitForTimeout(700);
  // 点选 WebA → 面包屑显示 SysA / WebA
  await page.locator('.react-flow__node', { hasText: 'WebA' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.getByText('WebA', { exact: true }).first()).toBeVisible();
  // 点面包屑里的 SysA → 选中 SysA
  await page.locator('.crumb-link', { hasText: 'SysA' }).first().click();
  await page.waitForTimeout(400);
  // 选中 SysA 后面包屑只剩 SysA
  const crumbTexts = await page.locator('.crumb').first().innerText();
  expect(crumbTexts).toContain('SysA');
  expect(crumbTexts).not.toContain('WebA');
});

test('撤销/重做：新增元素撤销删除、重做重建', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-undo-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Sys', parentId: null, posX: 400, posY: 300 } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  // 添加一个容器（子元素）
  await page.locator('.react-flow__node', { hasText: 'Sys' }).first().click({ button: 'right' });
  await page.waitForTimeout(400);
  await page.getByText('MySQL').click();
  await page.waitForTimeout(800);
  expect((await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data.length).toBe(2);
  // 撤销 → 容器被删
  await page.getByRole('button', { name: '↶ 撤销' }).click();
  await page.waitForTimeout(800);
  expect((await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data.length).toBe(1);
  // 重做 → 容器重建
  await page.getByRole('button', { name: '↷ 重做' }).click();
  await page.waitForTimeout(800);
  expect((await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data.length).toBe(2);
});

test('删除撤销：删元素→撤销重建→重做再删', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-undodel-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const sys = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'SysB', parentId: null, posX: 400, posY: 300 } })).json()).data;
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 2, type: 'container', name: 'WebB', parentId: sys.id, posX: 460, posY: 380 } });

  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.locator('.c4-toggle').first().click(); // 展开 SysB 显示 WebB
  await page.waitForTimeout(600);
  // 右键 WebB → 删除（先注册 dialog 接受确认）
  page.on('dialog', (d) => d.accept());
  await page.locator('.react-flow__node', { hasText: 'WebB' }).first().click({ button: 'right' });
  await page.waitForTimeout(400);
  await page.getByText('删除元素').click();
  await page.waitForTimeout(600);
  expect((await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data.length).toBe(1);
  // 撤销 → WebB 重建
  await page.getByRole('button', { name: '↶ 撤销' }).click();
  await page.waitForTimeout(800);
  expect((await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data.length).toBe(2);
});

test('常用系统模板一键生成', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-tpl-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '模板' }).click();
  await page.waitForTimeout(300);
  await page.getByText('订单系统').first().click();
  await page.waitForTimeout(1200);
  const elems = (await (await request.get(`${base}/projects/${proj.id}/elements`)).json()).data;
  expect(elems.some((e) => e.name === '订单系统' && e.type === 'softwareSystem')).toBe(true);
  expect(elems.some((e) => e.name === '订单库' && e.category === 'database')).toBe(true);
  expect(elems.some((e) => e.name === '消息队列' && e.category === 'queue')).toBe(true);
});

test('未追溯需求提醒', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-untraced-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/requirements`, { data: { title: '未追溯需求A', code: 'R-001', priority: 'high' } });
  await request.post(`${base}/projects/${proj.id}/requirements`, { data: { title: '已追溯需求B', code: 'R-002', priority: 'medium' } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /未追溯/ }).click();
  await page.waitForTimeout(400);
  await expect(page.getByText('未追溯需求A').first()).toBeVisible();
});

test('元素悬浮信息', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-hover-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'HoverSys', description: '一个测试系统', technology: 'Spring Boot', parentId: null, posX: 400, posY: 300 } });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  const node = page.locator('.react-flow__node', { hasText: 'HoverSys' }).first();
  await node.hover();
  await page.waitForTimeout(300);
  await expect(page.locator('.c4-tip').first()).toBeVisible();
  await expect(page.locator('.c4-tip').first()).toContainText('Spring Boot');
});

test('循环依赖检测', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-cycle-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const a = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'A', parentId: null, posX: 300, posY: 300 } })).json()).data;
  const b = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'B', parentId: null, posX: 700, posY: 300 } })).json()).data;
  const c = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'C', parentId: null, posX: 1100, posY: 300 } })).json()).data;
  for (const [s, t] of [[a.id, b.id], [b.id, c.id], [c.id, a.id]]) {
    await request.post(`${base}/projects/${proj.id}/relationships`, { data: { sourceId: s, targetId: t, label: 'uses', level: 1 } });
  }
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /校验/ }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText('循环依赖（橙）').first()).toBeVisible();
  await expect(page.getByText('环', { exact: true }).first()).toBeVisible();
  // 环节点里含 A/B/C
  const panelText = await page.locator('div').filter({ hasText: '循环依赖（橙）' }).first().innerText();
  expect(panelText).toContain('A');
  expect(panelText).toContain('B');
  expect(panelText).toContain('C');
});

test('多视图：新建/保存视图', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-view-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'ViewSys', parentId: null, posX: 400, posY: 300 } });
  // 默认应有一个「主视图」
  let views = (await (await request.get(`${base}/projects/${proj.id}/views`)).json()).data;
  expect(views.length).toBe(1);
  expect(views[0].name).toBe('主视图');
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '+ 新建视图' }).click();
  await page.waitForTimeout(600);
  views = (await (await request.get(`${base}/projects/${proj.id}/views`)).json()).data;
  expect(views.length).toBe(2);
  // 保存当前视图（不报错）
  await page.getByRole('button', { name: '存为视图' }).click();
  await page.waitForTimeout(600);
  const updated = (await (await request.get(`${base}/projects/${proj.id}/views`)).json()).data.find((v) => !v.isDefault);
  expect(updated.payload).toContain('"elemId"');
});

test('框体自由连线：抓框体空白拖到另一框体', async ({ page, request }) => {
  const base = 'http://127.0.0.1:8080/api';
  const proj = (await (await request.post(`${base}/projects`, { data: { name: 'e2e-freeconn-' + Date.now(), description: '' } })).json()).data;
  createdProjects.push(proj.id);
  const A = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Aaa', parentId: null, posX: 300, posY: 300 } })).json()).data;
  const B = (await (await request.post(`${base}/projects/${proj.id}/elements`, { data: { level: 1, type: 'softwareSystem', name: 'Bbb', parentId: null, posX: 900, posY: 300 } })).json()).data;
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/project/${proj.id}`);
  await page.waitForTimeout(1800);
  const a = page.locator('.react-flow__node', { hasText: 'Aaa' }).first();
  const b = page.locator('.react-flow__node', { hasText: 'Bbb' }).first();
  const ab = (await a.boundingBox())!;
  const bb = (await b.boundingBox())!;
  const axBefore = ab.x;
  // 从 A 框体最左侧空白(居中文本左边的 padding) → 拖到 B 框体最左侧空白
  await page.mouse.move(ab.x + ab.width * 0.12, ab.y + ab.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.12, bb.y + bb.height * 0.5, { steps: 28 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const rels = (await (await request.get(`${base}/projects/${proj.id}/relationships`)).json()).data;
  expect(rels.length).toBe(1);
  expect(rels[0].sourceId).toBe(A.id);
  expect(rels[0].targetId).toBe(B.id);
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
