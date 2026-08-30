import type { Element, Relationship, RelationshipMessage } from '../types';
import { byParentMap } from './geometry';

export interface EdgeDraft {
  id: string;
  sourceId: number;
  targetId: number;
  label: string;
  protocol: string;
  missing: boolean;
  relationshipId: number;
  arc?: boolean;
  arcDir?: 'top' | 'bottom'; // 双向边：A→B 走上边(top)、B→A 走下边(bottom)，避免交叉
}

export function parseMessages(r: Relationship): RelationshipMessage[] {
  if (r.messages) {
    try {
      const arr = JSON.parse(r.messages);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch {
      /* fallthrough */
    }
  }
  return [
    {
      name: r.interaction || r.label || 'uses',
      protocol: r.protocol,
      senderId: r.sourceContainerId ?? null,
      receiverId: r.targetContainerId ?? null,
    },
  ];
}

// 规则：消息必须落到「叶子」（无子级元素）。
// - 端点是叶级 → 正常；端点是父级 → 必须映射到其某个叶子后代，否则红（缺来源/去向）。
// - 折叠聚合：直接连了容器/组件的关系，端点不可见时向上取最近的可见父级(系统)。
export function buildEdges(
  relationships: Relationship[],
  allElements: Element[],
  visibleNum: Set<number>,
  expanded: Set<number>,
): EdgeDraft[] {
  const em = new Map(allElements.map((e) => [e.id, e]));
  const byParent = byParentMap(allElements);
  const childrenOf = (id: number): Element[] => byParent.get(id) || [];
  const hasChildren = (id: number): boolean => childrenOf(id).length > 0;
  const isLeaf = (id: number): boolean => !hasChildren(id);
  const isDescendantOf = (ancId: number, id: number): boolean => {
    let cur = em.get(id);
    while (cur && cur.parentId != null) {
      if (cur.parentId === ancId) return true;
      cur = em.get(cur.parentId);
    }
    return false;
  };
  const nearestVisibleAncestor = (id: number): Element | undefined => {
    let cur = em.get(id);
    while (cur) {
      if (visibleNum.has(cur.id)) return cur;
      cur = cur.parentId != null ? em.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  // 规则只在「系统级」端点生效：系统(softwareSystem)有子级时，消息必须映射到其某个叶子后代，否则红。
  // 容器↔容器这类同层关系不做下钻标红。
  const isSystemLike = (e: Element | undefined): boolean => !!e && e.type === 'softwareSystem';
  // 某侧是否「系统已映射到其叶子后代」（含系统本身是叶子）
  const sideOk = (parent: Element, childId: number | null | undefined): boolean =>
    childId != null && isLeaf(childId) && (childId === parent.id || isDescendantOf(parent.id, childId));

  const drafts: EdgeDraft[] = [];

  for (const r of relationships) {
    const rawS = em.get(r.sourceId);
    const rawT = em.get(r.targetId);
    if (!rawS || !rawT) continue;
    const vs = nearestVisibleAncestor(r.sourceId);
    const vt = nearestVisibleAncestor(r.targetId);
    if (!vs || !vt) continue;
    // 内部关系：两端聚合到同一可见父级（如容器内组件互连，折叠后都归到父系统）→ 不画自环
    if (vs.id === vt.id) continue;

    const msgs = parseMessages(r);
    const sExp = expanded.has(vs.id);
    const tExp = expanded.has(vt.id);

    // 缺失(红)判定：系统级端点有子级且未映射到其叶子后代
    const sideMissing = (m: RelationshipMessage): boolean => {
      const senderEff = m.senderId ?? r.sourceId;
      const receiverEff = m.receiverId ?? r.targetId;
      const sM = isSystemLike(vs) && hasChildren(vs.id) && !sideOk(vs, senderEff);
      const tM = isSystemLike(vt) && hasChildren(vt.id) && !sideOk(vt, receiverEff);
      return sM || tM;
    };

    if (sExp || tExp) {
      msgs.forEach((m, i) => {
        const senderEff = m.senderId ?? r.sourceId;
        const receiverEff = m.receiverId ?? r.targetId;
        let effS = vs;
        let effT = vt;

        // 路由端点取 sender/receiver 的「最近可见祖先」：若 sender/receiver 被折叠，则聚合到其可见父级，避免连到不存在的节点
        if (tExp && receiverEff != null) {
          const rv = nearestVisibleAncestor(receiverEff);
          if (rv && isDescendantOf(vt.id, rv.id)) effT = rv;
        }
        if (sExp && senderEff != null) {
          const sv = nearestVisibleAncestor(senderEff);
          if (sv && isDescendantOf(vs.id, sv.id)) effS = sv;
        }

        const label = m.name || 'uses';
        drafts.push({
          id: `rel-${r.id}-m${i}` + (effS.id !== vs.id ? '-s' : '') + (effT.id !== vt.id ? '-t' : ''),
          sourceId: effS.id,
          targetId: effT.id,
          label,
          protocol: m.protocol,
          missing: sideMissing(m),
          relationshipId: r.id,
        });
      });
    } else {
      // 折叠/聚合线
      const missing = msgs.some((m) => sideMissing(m));
      const label = msgs.map((m) => m.name).filter(Boolean).join('\n') || 'uses';
      drafts.push({ id: `rel-${r.id}`, sourceId: vs.id, targetId: vt.id, label, protocol: msgs[0]?.protocol ?? '', missing, relationshipId: r.id });
    }
  }

  // 双向边(同一对端点存在 A→B 与 B→A)用「弧形绕开」避免重叠；同向并行边用端点错开
  const dirPairs = new Map<string, { fwd: boolean; rev: boolean }>();
  for (const d of drafts) {
    const key = d.sourceId < d.targetId ? `${d.sourceId}-${d.targetId}` : `${d.targetId}-${d.sourceId}`;
    let e = dirPairs.get(key);
    if (!e) { e = { fwd: false, rev: false }; dirPairs.set(key, e); }
    if (d.sourceId < d.targetId) e.fwd = true; else e.rev = true;
  }
  for (const d of drafts) {
    const key = d.sourceId < d.targetId ? `${d.sourceId}-${d.targetId}` : `${d.targetId}-${d.sourceId}`;
    const e = dirPairs.get(key);
    // 双向边中，反向(B→A, sourceId>targetId)绕开到另一侧；正向(A→B)走直的、端点铺开
    d.arc = !!(e && e.fwd && e.rev && d.sourceId > d.targetId);
    if (d.arc) d.arcDir = 'bottom';
  }

  return drafts;
}
