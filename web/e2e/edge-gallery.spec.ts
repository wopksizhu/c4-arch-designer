import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080/api';
const created: number[] = [];

test.afterAll(async ({ request }) => {
  for (const id of created) { await request.delete(`${BASE}/projects/${id}`).catch(() => {}); }
});

async function mkProject(name: string, request: any) {
  const p = (await (await request.post(`${BASE}/projects`, { data: { name, description: '' } })).json()).data;
  created.push(p.id);
  return p;
}
async function elm(request: any, pid: number, name: string, x: number, y: number, level = 1) {
  return (await (await request.post(`${BASE}/projects/${pid}/elements`, { data: { level, type: 'softwareSystem', name, parentId: null, posX: x, posY: y } })).json()).data;
}
async function rel(request: any, pid: number, s: number, t: number, lbl: string) {
  const msg = `[{"name":"${lbl}","protocol":"","senderId":null,"receiverId":null}]`;
  await request.post(`${BASE}/projects/${pid}/relationships`, { data: { sourceId: s, targetId: t, label: lbl, interaction: lbl, level: 1, messages: msg } });
}
async function edgeCount(page: any): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('path.c4-edge-path').length);
}

async function shoot(page: any, name: string, expectCount: number) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await new Promise((r) => setTimeout(r, 400));
  await page.waitForTimeout(600);
  const n = await edgeCount(page);
  // eslint-disable-next-line no-console
  console.log('GALLERY ' + name + ' edges=' + n + ' expect=' + expectCount);
  expect(n).toBe(expectCount);
  await page.screenshot({ path: `gallery/${name}.png`, fullPage: false });
}

// 每个场景：建立数据 + 打开 + 断言边数 + 截图到 gallery/
test('gallery', async ({ page, request }) => {
  mkdirSync('gallery', { recursive: true });

  // 1. 单条水平
  {
    const p = await mkProject('g-single', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 1000, 400);
    await rel(request, p.id, a.id, b.id, 'm');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '01-single', 1);
  }
  // 2. 同向并行 2 条
  {
    const p = await mkProject('g-p2', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 1000, 400);
    await rel(request, p.id, a.id, b.id, 'm1'); await rel(request, p.id, a.id, b.id, 'm2');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '02-parallel2', 2);
  }
  // 3. 同向并行 4 条
  {
    const p = await mkProject('g-p4', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 1000, 400);
    for (const i of [1, 2, 3, 4]) await rel(request, p.id, a.id, b.id, `m${i}`);
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '03-parallel4', 4);
  }
  // 4. 单向 A→B + B→C（穿透）
  {
    const p = await mkProject('g-chain', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 700, 400); const c = await elm(request, p.id, 'C', 1100, 400);
    await rel(request, p.id, a.id, b.id, 'm1'); await rel(request, p.id, b.id, c.id, 'm2');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '04-chain', 2);
  }
  // 5. 三角互连 A→B, B→C, C→A
  {
    const p = await mkProject('g-tri', request);
    const a = await elm(request, p.id, 'A', 400, 350); const b = await elm(request, p.id, 'B', 1000, 250); const c = await elm(request, p.id, 'C', 900, 700);
    await rel(request, p.id, a.id, b.id, 'm1'); await rel(request, p.id, b.id, c.id, 'm2'); await rel(request, p.id, c.id, a.id, 'm3');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '05-triangle', 3);
  }
  // 6. 双向水平 A↔B
  {
    const p = await mkProject('g-bih', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 1000, 400);
    await rel(request, p.id, a.id, b.id, 'f'); await rel(request, p.id, b.id, a.id, 'r');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '06-bidir-h', 2);
  }
  // 7. 双向垂直 A(上)↔B(下)
  {
    const p = await mkProject('g-biv', request);
    const a = await elm(request, p.id, 'A', 700, 200); const b = await elm(request, p.id, 'B', 700, 800);
    await rel(request, p.id, a.id, b.id, 'f'); await rel(request, p.id, b.id, a.id, 'r');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '07-bidir-v', 2);
  }
  // 8. 星形：中心连 4 个
  {
    const p = await mkProject('g-star', request);
    const c = await elm(request, p.id, 'Center', 700, 450);
    const n1 = await elm(request, p.id, 'N1', 200, 200); const n2 = await elm(request, p.id, 'N2', 1200, 200); const n3 = await elm(request, p.id, 'N3', 200, 700); const n4 = await elm(request, p.id, 'N4', 1200, 700);
    await rel(request, p.id, c.id, n1.id, 'm1'); await rel(request, p.id, c.id, n2.id, 'm2'); await rel(request, p.id, c.id, n3.id, 'm3'); await rel(request, p.id, c.id, n4.id, 'm4');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '08-star', 4);
  }
  // 9. 垂直并行 3 条（A 上 B 下）
  {
    const p = await mkProject('g-vp', request);
    const a = await elm(request, p.id, 'A', 700, 200); const b = await elm(request, p.id, 'B', 700, 800);
    for (const i of [1, 2, 3]) await rel(request, p.id, a.id, b.id, `m${i}`);
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '09-vert-parallel3', 3);
  }
  // 10. 混合 4同向+2反向
  {
    const p = await mkProject('g-mix', request);
    const a = await elm(request, p.id, 'A', 300, 400); const b = await elm(request, p.id, 'B', 1000, 400);
    for (const i of [1, 2, 3, 4]) await rel(request, p.id, a.id, b.id, `m${i}`);
    await rel(request, p.id, b.id, a.id, 'r1'); await rel(request, p.id, b.id, a.id, 'r2');
    await page.goto(`/project/${p.id}`); await page.waitForTimeout(1800); await shoot(page, '10-mix', 6);
  }
});
