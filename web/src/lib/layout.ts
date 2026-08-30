import type { Element, Relationship } from '../types';
import { NODE_W, NODE_H, PAD, CHILD_MIN_X, CHILD_MIN_Y, byParentMap } from './geometry';

const GAP_X = 80; // 同层节点水平间距
const GAP_Y = 130; // 层间垂直间距

type Size = { w: number; h: number };

interface LayeredEdge { s: number; t: number }

// 对一组兄弟节点做分层(Sugiyama-lite)布局：按连线关系分「层」+ 层内重心排序以减少交叉
// direction: 'down' 自上而下分层；'right' 自左向右分层
function layered(nodes: number[], edges: LayeredEdge[], sizes: Map<number, Size>, direction: 'down' | 'right'): Map<number, { x: number; y: number }> {
  const n = nodes.length;
  const idx = new Map<number, number>();
  nodes.forEach((id, i) => idx.set(id, i));
  const adj: number[][] = Array.from({ length: n }, () => []);
  const radj: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  edges.forEach(({ s, t }) => {
    const si = idx.get(s);
    const ti = idx.get(t);
    if (si == null || ti == null) return;
    adj[si].push(ti);
    radj[ti].push(si);
    indeg[ti]++;
  });

  // Kahn 拓扑序（含环兜底）
  const order: number[] = [];
  const dindeg = [...indeg];
  const q: number[] = [];
  for (let i = 0; i < n; i++) if (dindeg[i] === 0) q.push(i);
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    adj[u].forEach((v) => {
      if (--dindeg[v] === 0) q.push(v);
    });
  }
  const inOrder = new Set(order);
  nodes.forEach((_, i) => {
    if (!inOrder.has(i)) order.push(i); // 环内节点按 id 兜底
  });

  // 层分配：节点层 = max(前驱层)+1
  const layer = new Array(n).fill(0);
  order.forEach((u) => {
    radj[u].forEach((p) => {
      layer[u] = Math.max(layer[u], layer[p] + 1);
    });
  });
  const maxLayer = Math.max(0, ...layer);
  const layers: number[][] = Array.from({ length: maxLayer + 1 }, () => []);
  order.forEach((u) => layers[layer[u]].push(u));

  // 重心法减少交叉（前向+后向多轮）
  const bary = (u: number, nbrs: number[][], targetLayer: number[], fallback: number): number => {
    let sum = 0,
      cnt = 0;
    (nbrs[u] || []).forEach((v) => {
      const p = targetLayer.indexOf(v);
      if (p >= 0) {
        sum += p;
        cnt++;
      }
    });
    return cnt ? sum / cnt : fallback;
  };
  const NO_ITER = 8;
  for (let it = 0; it < NO_ITER; it++) {
    for (let l = 1; l <= maxLayer; l++) {
      layers[l].sort((a, b) => bary(a, radj, layers[l - 1], a) - bary(b, radj, layers[l - 1], b));
    }
    for (let l = maxLayer - 1; l >= 0; l--) {
      layers[l].sort((a, b) => bary(a, adj, layers[l + 1], a) - bary(b, adj, layers[l + 1], b));
    }
  }

  // 坐标：层内以最大宽度居中排列
  const layerWidths = layers.map((l) => {
    let w = 0;
    l.forEach((u) => (w += sizes.get(nodes[u])!.w));
    return w + (l.length ? (l.length - 1) * GAP_X : 0);
  });
  const totalW = Math.max(...layerWidths, 0);
  let maxH = 0;
  nodes.forEach((id) => (maxH = Math.max(maxH, sizes.get(id)!.h)));

  const pos = new Map<number, { x: number; y: number }>();
  let cursorIndent = 0;
  layers.forEach((l, li) => {
    const within = (totalW - layerWidths[li]) / 2;
    if (direction === 'right') {
      let yy = within;
      l.forEach((u) => {
        const id = nodes[u];
        pos.set(id, { x: cursorIndent, y: yy });
        yy += sizes.get(id)!.h + GAP_Y;
      });
      cursorIndent += maxH + GAP_X; // 层→列
    } else {
      let xx = within;
      l.forEach((u) => {
        const id = nodes[u];
        pos.set(id, { x: xx, y: cursorIndent });
        xx += sizes.get(id)!.w + GAP_X;
      });
      cursorIndent += maxH + GAP_Y; // 层→行
    }
  });
  return pos;
}

// 生成可见元素的层次化布局（考虑父子包含 + 连线关系）——无交叉/重叠优先
export function graphLayout(
  elements: Element[],
  relationships: Relationship[],
  visibleIds: Set<number>,
  expanded: Set<number>,
  direction: 'down' | 'right' = 'down',
): Map<number, { x: number; y: number }> {
  const byParent = byParentMap(elements);
  const relEdges = relationships
    .filter((r) => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId))
    .map((r) => ({ s: r.sourceId, t: r.targetId })) as LayeredEdge[];

  const pos = new Map<number, { x: number; y: number }>();
  const sizes = new Map<number, Size>();
  const relChild = new Map<number, Map<number, { x: number; y: number }>>(); // id -> 其子元素相对其框原点的坐标

  const visibleChildIds = (id: number): number[] =>
    (expanded.has(id) ? byParent.get(id) || [] : [])
      .filter((k) => visibleIds.has(k.id))
      .map((k) => k.id);

  // 阶段一：从叶子向上算「尺寸」和「子元素相对坐标」（相对父框原点(0,0)）
  function computeSizes(ids: number[]) {
    ids.forEach((id) => {
      const kidIds = visibleChildIds(id);
      if (kidIds.length) {
        computeSizes(kidIds); // 先算子元素尺寸
        const kidSizes = new Map<number, Size>();
        kidIds.forEach((k) => kidSizes.set(k, sizes.get(k)!));
        const sibEdges = relEdges.filter((e) => kidIds.includes(e.s) && kidIds.includes(e.t));
        const placed = layered(kidIds, sibEdges, kidSizes, direction);
        const rel = new Map<number, { x: number; y: number }>();
        let maxW = 0;
        let maxH = 0;
        kidIds.forEach((k) => {
          const px = placed.get(k)!.x;
          const py = placed.get(k)!.y;
          const rx = CHILD_MIN_X + px;
          const ry = CHILD_MIN_Y + py;
          rel.set(k, { x: rx, y: ry });
          maxW = Math.max(maxW, rx + kidSizes.get(k)!.w);
          maxH = Math.max(maxH, ry + kidSizes.get(k)!.h);
        });
        relChild.set(id, rel);
        sizes.set(id, { w: maxW + PAD, h: maxH + PAD });
      } else {
        sizes.set(id, { w: NODE_W, h: NODE_H });
      }
    });
  }

  // 阶段二：自顶向下放置为「绝对坐标」
  function place(ids: number[], ox: number, oy: number) {
    const sibEdges = relEdges.filter((e) => ids.includes(e.s) && ids.includes(e.t));
    const placed = layered(ids, sibEdges, sizes, direction);
    ids.forEach((id) => {
      const p = placed.get(id)!;
      const absX = ox + p.x;
      const absY = oy + p.y;
      pos.set(id, { x: absX, y: absY });
      const rel = relChild.get(id);
      if (rel) {
        rel.forEach((rp, childId) => {
          place([childId], absX + rp.x, absY + rp.y);
        });
      }
    });
  }

  const roots = elements.filter((e) => e.parentId == null && visibleIds.has(e.id)).map((e) => e.id);
  if (roots.length) {
    computeSizes(roots);
    place(roots, 0, 0);
  }
  return pos;
}
