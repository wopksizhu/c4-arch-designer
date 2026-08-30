import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:8080/api';
const created: number[] = [];

test.afterAll(async ({ request }) => {
  for (const id of created) { await request.delete(`${BASE}/projects/${id}`).catch(() => {}); }
});

async function mkProject(payload: { name: string } & Record<string, unknown>, request: any) {
  const p = (await (await request.post(`${BASE}/projects`, { data: payload })).json()).data;
  created.push(p.id);
  return p;
}
async function elm(request: any, pid: number, level: number, type: string, name: string, x: number, y: number) {
  const r = (await (await request.post(`${BASE}/projects/${pid}/elements`, { data: { level, type, name, parentId: null, posX: x, posY: y } })).json()).data;
  return r;
}
async function rel(request: any, pid: number, s: number, t: number, lbl: string) {
  const msg = `[{"name":"${lbl}","protocol":"","senderId":null,"receiverId":null}]`;
  await request.post(`${BASE}/projects/${pid}/relationships`, { data: { sourceId: s, targetId: t, label: lbl, interaction: lbl, level: 1, messages: msg } });
}
// 读取每条带箭头(主)边的起点(M x,y)
async function edgeStarts(page: any): Promise<Array<[number, number]>> {
  return page.evaluate(() => {
    const out: Array<[number, number]> = [];
    document.querySelectorAll('path.c4-edge-path').forEach((p) => {
      const d = p.getAttribute('d') || '';
      const m = d.match(/M\s*([-\d.]+)[\s,]+([-\d.]+)/);
      if (m) out.push([parseFloat(m[1]), parseFloat(m[2])]);
    });
    return out;
  });
}

async function open(page: any, pid: number) {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`/project/${pid}`);
  await page.waitForTimeout(2000);
}

test('1 条边：边数正确', async ({ page, request }) => {
  const p = await mkProject({ name: 'e1-' + Date.now() }, request);
  const a = await elm(request, p.id, 1, 'softwareSystem', 'A', 300, 400);
  const b = await elm(request, p.id, 1, 'softwareSystem', 'B', 1000, 400);
  await rel(request, p.id, a.id, b.id, 'm');
  await open(page, p.id);
  const starts = await edgeStarts(page);
  expect(starts.length).toBe(1);
});

test('同向并行 3 条：3 条边、3 个不同起点(分散不重叠)', async ({ page, request }) => {
  const p = await mkProject({ name: 'e3-' + Date.now() }, request);
  const a = await elm(request, p.id, 1, 'softwareSystem', 'A', 300, 400);
  const b = await elm(request, p.id, 1, 'softwareSystem', 'B', 1000, 400);
  for (const i of [1, 2, 3]) await rel(request, p.id, a.id, b.id, `m${i}`);
  await open(page, p.id);
  const starts = await edgeStarts(page);
  expect(starts.length).toBe(3);
  const key = starts.map((s) => s[0].toFixed(1) + '|' + s[1].toFixed(1));
  expect(new Set(key).size).toBe(3); // 3 个不同起点 → 分散、不重叠
});

test('同向并行 6 条：6 条边、起点两两不同(不重叠)', async ({ page, request }) => {
  const p = await mkProject({ name: 'e6-' + Date.now() }, request);
  const a = await elm(request, p.id, 1, 'softwareSystem', 'A', 300, 400);
  const b = await elm(request, p.id, 1, 'softwareSystem', 'B', 1000, 400);
  for (const i of [1, 2, 3, 4, 5, 6]) await rel(request, p.id, a.id, b.id, `m${i}`);
  await open(page, p.id);
  const starts = await edgeStarts(page);
  expect(starts.length).toBe(6);
  const key = starts.map((s) => s[0].toFixed(1) + '|' + s[1].toFixed(1));
  expect(new Set(key).size).toBe(6);
});

test('双向 A↔B：2 条边、起点不同(一条直/一条绕，不重叠)', async ({ page, request }) => {
  const p = await mkProject({ name: 'eBi-' + Date.now() }, request);
  const a = await elm(request, p.id, 1, 'softwareSystem', 'A', 300, 400);
  const b = await elm(request, p.id, 1, 'softwareSystem', 'B', 1000, 400);
  await rel(request, p.id, a.id, b.id, 'm');
  await rel(request, p.id, b.id, a.id, 'r');
  await open(page, p.id);
  const starts = await edgeStarts(page);
  expect(starts.length).toBe(2);
  const key = starts.map((s) => s[0].toFixed(1) + '|' + s[1].toFixed(1));
  expect(new Set(key).size).toBe(2);
});

test('混合：4 同向 + 2 反向 = 6 条，起点两两不同', async ({ page, request }) => {
  const p = await mkProject({ name: 'eMix-' + Date.now() }, request);
  const a = await elm(request, p.id, 1, 'softwareSystem', 'A', 300, 400);
  const b = await elm(request, p.id, 1, 'softwareSystem', 'B', 1000, 400);
  for (const i of [1, 2, 3, 4]) await rel(request, p.id, a.id, b.id, `m${i}`);
  await rel(request, p.id, b.id, a.id, 'r1');
  await rel(request, p.id, b.id, a.id, 'r2');
  await open(page, p.id);
  const starts = await edgeStarts(page);
  expect(starts.length).toBe(6);
  const key = starts.map((s) => s[0].toFixed(1) + '|' + s[1].toFixed(1));
  expect(new Set(key).size).toBe(6);
});
