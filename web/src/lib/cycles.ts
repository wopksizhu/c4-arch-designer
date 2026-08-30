import type { Element, Relationship } from '../types';

export interface CycleInfo {
  nodes: Set<number>;              // 参与环的元素
  edges: Set<number>;              // 两端都在同一个环内的关系 id
  cycles: Array<Array<number>>;    // 每个强连通分量（元素 id），size>1
}

// Tarjan 强连通分量检测循环依赖
export function detectCycles(elements: Element[], relationships: Relationship[]): CycleInfo {
  const ids = new Set(elements.map((e) => e.id));
  const adj = new Map<number, number[]>();
  relationships.forEach((r) => {
    if (ids.has(r.sourceId) && ids.has(r.targetId) && r.sourceId !== r.targetId) {
      if (!adj.has(r.sourceId)) adj.set(r.sourceId, []);
      adj.get(r.sourceId)!.push(r.targetId);
    }
  });

  let index = 0;
  const indices = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const sccs: number[][] = [];

  const strongconnect = (v: number) => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indices.get(w)!));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  };

  ids.forEach((v) => { if (!indices.has(v)) strongconnect(v); });

  const nodes = new Set<number>();
  const cycles: number[][] = [];
  sccs.forEach((scc) => {
    if (scc.length > 1) {
      scc.forEach((id) => nodes.add(id));
      cycles.push(scc);
    }
  });

  const edges = new Set<number>();
  relationships.forEach((r) => {
    if (nodes.has(r.sourceId) && nodes.has(r.targetId)) edges.add(r.id);
  });

  return { nodes, edges, cycles };
}
