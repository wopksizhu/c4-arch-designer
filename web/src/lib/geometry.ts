import type { Element } from '../types';

// 基础尺寸
export const NODE_W = 200;
export const NODE_H = 100;
export const PAD = 50; // 边界框内边距（right/down 由 computeExtent 决定）
export const CHILD_MIN_X = 56; // 子元素距父框左侧的最小内缩
export const CHILD_MIN_Y = 64; // 子元素距父框顶部的最小内缩（越过 header）

type Size = { w: number; h: number };

export function byParentMap(elements: Element[]): Map<number, Element[]> {
  const byParent = new Map<number, Element[]>();
  elements.forEach((e) => {
    const a = byParent.get(e.parentId ?? -1) || [];
    a.push(e);
    byParent.set(e.parentId ?? -1, a);
  });
  return byParent;
}

// 展开的父级：按「子元素真实位置」包裹边界框（自底向上递归）
export function computeExtent(
  e: Element,
  byParent: Map<number, Element[]>,
  extended: Set<number>,
  memo: Map<number, Size>,
): Size {
  if (memo.has(e.id)) return memo.get(e.id)!;
  const kids = extended.has(e.id) ? byParent.get(e.id) || [] : [];
  if (!kids.length) {
    const r = { w: NODE_W, h: NODE_H };
    memo.set(e.id, r);
    return r;
  }
  let maxW = 0,
    maxH = 0;
  kids.forEach((c) => {
    const ce = computeExtent(c, byParent, extended, memo);
    const rx = c.posX - e.posX;
    const ry = c.posY - e.posY;
    maxW = Math.max(maxW, rx + ce.w);
    maxH = Math.max(maxH, ry + ce.h);
  });
  const r = { w: maxW + PAD * 2, h: maxH + PAD * 2 };
  memo.set(e.id, r);
  return r;
}

type Rect = { id: number; x: number; y: number; w: number; h: number };

function overlap(a: Rect, b: Rect): boolean {
  return (
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0
  );
}

// 是否为祖先-后代（同一张图内自动包含，不算重叠）
function ancestors(elements: Element[]): Map<number, Set<number>> {
  const em = new Map(elements.map((e) => [e.id, e]));
  const anc = new Map<number, Set<number>>();
  elements.forEach((e) => {
    const s = new Set<number>();
    let p = e.parentId;
    while (p != null) {
      s.add(p);
      const pe = em.get(p);
      p = pe ? pe.parentId : null;
    }
    anc.set(e.id, s);
  });
  return anc;
}

// 最小化布局：保持当前坐标，仅把互相重叠的可见元素向下/右推开（避免全盘重排）
// 返回需要持久化的坐标 Map<id,{x,y}>（未变更的元素不写入）
export function minimalLayout(
  elements: Element[],
  visibleIds: Set<number>,
  extended: Set<number>,
): Map<number, { x: number; y: number }> {
  const byParent = byParentMap(elements);
  const memo = new Map<number, Size>();
  const anc = ancestors(elements);

  const rects: Rect[] = [];
  const base = new Map<number, { x: number; y: number }>();
  elements
    .filter((e) => visibleIds.has(e.id))
    .forEach((e) => {
      const kids = extended.has(e.id) ? byParent.get(e.id) || [] : [];
      let w = NODE_W,
        h = NODE_H;
      if (kids.length) {
        const ex = computeExtent(e, byParent, extended, memo);
        w = ex.w;
        h = ex.h;
      }
      const r: Rect = { id: e.id, x: e.posX, y: e.posY, w, h };
      rects.push(r);
      base.set(e.id, { x: e.posX, y: e.posY });
    });

  // 按 y 再 x 排序，自左上向右下扫描，遇到重叠就把后一个往下/右推
  const sorted = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: Rect[] = [];
  const out = new Map<number, { x: number; y: number }>();

  for (const it of sorted) {
    let x = it.x,
      y = it.y;
    let guard = 0;
    let collided = true;
    while (collided && guard++ < 20) {
      collided = false;
      for (const p of placed) {
        // 跳过祖先-后代（包含不视为重叠）、以及自身
        if (p.id === it.id) continue;
        if (anc.get(it.id)?.has(p.id) || anc.get(p.id)?.has(it.id)) continue;
        const a: Rect = { id: it.id, x, y, w: it.w, h: it.h };
        if (overlap(a, p)) {
          const dy = p.y + p.h + PAD / 2 - y;
          const dx = p.x + p.w + PAD / 2 - x;
          if (dy >= 0 && dy <= Math.abs(dx)) {
            y += Math.max(0, dy);
          } else {
            x += Math.max(0, dx);
          }
          collided = true;
        }
      }
    }
    it.x = x;
    it.y = y;
    placed.push(it);
    if (x !== base.get(it.id)!.x || y !== base.get(it.id)!.y) {
      out.set(it.id, { x, y });
    }
  }
  return out;
}

// 判断某元素是否能被拖到目标坐标（约束在父框内：不向左/上越界；右/下自由，框体自适应）
export function clampChildPos(
  parent: Element | undefined,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!parent) return { x, y };
  return {
    x: Math.max(x, parent.posX + CHILD_MIN_X),
    y: Math.max(y, parent.posY + CHILD_MIN_Y),
  };
}
