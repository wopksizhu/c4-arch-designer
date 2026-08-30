import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import C4Canvas from '../components/C4Canvas';
import ElementTree from '../components/ElementTree';
import ComboInput from '../components/ComboInput';
import { minimalLayout, NODE_H, CHILD_MIN_X, CHILD_MIN_Y, gridChildPositions } from '../lib/geometry';
import { graphLayout } from '../lib/layout';
import { parseMessages, buildEdges } from '../lib/edges';
import type { PaletteItem } from '../lib/palette';
import { INTERACTION_PRESETS, PROTOCOL_PRESETS, TECH_PRESETS, categoryForTech } from '../lib/presets';
import { CATEGORY_LIST } from '../lib/visual';
import { TEMPLATES, type Template } from '../lib/templates';
import type {
  AiDraft,
  Element,
  ElementType,
  ImpactResult,
  Project,
  Prototype,
  Relationship,
  RelationshipMessage,
  Requirement,
  TraceLink,
  TraceMatrixRow,
  View,
} from '../types';

const LEVEL_NAME: Record<number, string> = { 1: 'Context', 2: 'Container', 3: 'Component' };
const TYPES: Record<number, string[]> = {
  1: ['person', 'softwareSystem'],
  2: ['container'],
  3: ['component'],
};
const TYPE_LABEL: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};
const prioLabel = (p: string) => (p === 'high' ? '高' : p === 'low' ? '低' : '中');

// 收集某元素的全部后代 id（递归），用于父元素拖动时整体平移子元素
function collectDescendants(elements: Element[], id: number): number[] {
  const out: number[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    elements.forEach((e) => {
      if (e.parentId === cur) {
        out.push(e.id);
        stack.push(e.id);
      }
    });
  }
  return out;
}

// 复制/粘贴剪贴板：一棵子树（含内部关系），用「相对索引」表示父级与关系端点
interface CopyBundle {
  rootId: number;
  parentId: number | null;
  elements: Array<{
    name: string; type: string; level: number; category?: string; technology: string; description: string; tags: string;
    parentRef: number | null; posX: number; posY: number;
  }>;
  relationships: Array<{ sourceRef: number; targetRef: number; label: string; interaction: string; protocol: string; messages: string; sourceContainerId?: number | null; targetContainerId?: number | null }>;
}
export default function ModelPage() {
  const { id } = useParams();
  const pid = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [traceLinks, setTraceLinks] = useState<TraceLink[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    try {
      const [p, es, rs, qs, ps, ts, vs] = await Promise.all([
        api.listProjects().then((ps) => ps.find((x) => x.id === pid) || null),
        api.listElements(pid),
        api.listRelationships(pid),
        api.listRequirements(pid),
        api.listPrototypes(pid),
        api.listTraceLinks(pid),
        api.listViews(pid),
      ]);
      setProject(p);
      setElements(es);
      setRelationships(rs);
      setRequirements(qs);
      setPrototypes(ps);
      setTraceLinks(ts);
      setViews(vs);
      // 默认切到「主视图」（isDefault 或第一个）
      setCurrentViewId((cur) => {
        if (cur != null && vs.some((v) => v.id === cur)) return cur;
        return vs.find((v) => v.isDefault)?.id ?? vs[0]?.id ?? null;
      });
    } catch (e: any) {
      setErr(e.message);
    }
  }, [pid]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 自动布局：分层(Sugiyama)算法，按连线关系排层、层内重心排序减少交叉，处理父子包含
  const applyLayout = async (dir?: 'down' | 'right', exp?: Set<number>) => {
    const d = dir ?? layoutDir;
    const e = exp ?? expanded;
    const before = snapPos();
    const pos = graphLayout(elements, relationships, visibleIdsFor(e), e, d);
    if (pos.size === 0) return;
    await Promise.all([...pos.entries()].map(([id, p]) => api.updateElement(id, { posX: p.x, posY: p.y })));
    setElements((prev) => prev.map((e) => (pos.has(e.id) ? { ...e, posX: pos.get(e.id)!.x, posY: pos.get(e.id)!.y } : e)));
    const after = snapPos();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      pushHistory({ undo: () => restorePos(before), redo: () => restorePos(after) });
    }
    reload();
  };

  // 可见元素 = 根元素 + 所有“展开”父级的后代（递归）
  const visibleIdsFor = useCallback(
    (expSet: Set<number>): Set<number> => {
      const byParent = new Map<number, Element[]>();
      const roots: Element[] = [];
      elements.forEach((e) => {
        if (e.parentId == null) roots.push(e);
        else {
          const arr = byParent.get(e.parentId) || [];
          arr.push(e);
          byParent.set(e.parentId, arr);
        }
      });
      const out = new Set<number>();
      const walk = (ids: Element[]) =>
        ids.forEach((e) => {
          out.add(e.id);
          if (expSet.has(e.id)) walk(byParent.get(e.id) || []);
        });
      walk(roots);
      return out;
    },
    [elements],
  );

  // 泳道分组已移除（后期做自定义分组）——保持最小化布局为展示层覆盖
  const displayPos = useMemo(() => minimalLayout(elements, visibleIdsFor(expanded), expanded), [elements, visibleIdsFor, expanded]);

  const expand = (id: number) => {
    const willExpand = !expanded.has(id);
    const n = new Set(expanded);
    if (willExpand) n.add(id); else n.delete(id);
    setExpanded(n);
    // 展开时聚焦到父框+其子元素，让新内容就在眼前
    if (willExpand) {
      const children = elements.filter((e) => e.parentId === id);
      focusCanvas([id, ...children.map((e) => e.id)]);
      // 把父框内子元素排成居中网格（落库：一次性、可拖可撤销）
      if (children.length) {
        const parent = elements.find((e) => e.id === id);
        if (parent) void gridChildren(parent, children);
      }
    }
  };

  // 展开时把父框内子元素排成网格并持久化
  const gridChildren = async (parent: Element, kids: Element[]) => {
    const pos = gridChildPositions(parent, kids);
    await Promise.all([...pos.entries()].map(([cid, p]) => api.updateElement(cid, { posX: p.x, posY: p.y })));
    setElements((prev) => prev.map((e) => (pos.has(e.id) ? { ...e, posX: pos.get(e.id)!.x, posY: pos.get(e.id)!.y } : e)));
    reload();
  };

  const hasChildren = useCallback((id: number) => elements.some((e) => e.parentId === id), [elements]);

  const visibleElements = useMemo(
    () => elements.filter((e) => visibleIdsFor(expanded).has(e.id)),
    [elements, visibleIdsFor, expanded],
  );

  const contextIds = useMemo(() => new Set<number>(expanded), [expanded]);
  const viewLevel = 1; // 顶栏添加为根层级

  const visibleIds = useMemo(() => new Set(visibleElements.map((e) => e.id)), [visibleElements]);
  const visibleRelationships = useMemo(
    () => relationships.filter((r) => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId)),
    [relationships, visibleIds],
  );

  // 校验：用 buildEdges 找出「缺失(红)」的消息（系统级消息未落到叶子）
  const validation = useMemo(() => {
    const drafts = buildEdges(relationships, elements, visibleIds, expanded);
    return drafts
      .filter((d) => d.missing)
      .map((d) => {
        const s = elements.find((e) => e.id === d.sourceId);
        const t = elements.find((e) => e.id === d.targetId);
        return {
          relationshipId: d.relationshipId,
          label: d.label.split('\n')[0] || 'uses',
          sName: s?.name ?? '?',
          tName: t?.name ?? '?',
          missing: d.missing,
        };
      });
  }, [relationships, elements, visibleIds, expanded]);


  async function addElement(type: string, parentId?: number | null, extra?: { category?: string; technology?: string; name?: string; posX?: number; posY?: number }) {
    const parent = parentId != null ? elements.find((e) => e.id === parentId) : null;
    const siblings = elements.filter((e) => e.parentId === parentId);
    // 子元素默认放在父框内（最小内缩处）向下错开；若给了鼠标处坐标，则放在鼠标处并钳制在父框内
    let posX = parent ? parent.posX + CHILD_MIN_X : 200 + elements.length * 20;
    let posY = parent ? parent.posY + CHILD_MIN_Y + siblings.length * (NODE_H + 60) : 200 + elements.length * 20;
    if (extra?.posX != null) posX = extra.posX;
    if (extra?.posY != null) posY = extra.posY;
    if (parent) {
      posX = Math.max(posX, parent.posX + CHILD_MIN_X);
      posY = Math.max(posY, parent.posY + CHILD_MIN_Y);
    }
    const payload = {
      level: parent ? parent.level + 1 : 1,
      type: type as ElementType,
      name: extra?.name || 'New ' + TYPE_LABEL[type],
      category: extra?.category ?? '',
      technology: extra?.technology ?? '',
      parentId: parentId ?? null,
      posX,
      posY,
    };
    const e = await api.createElement(pid, payload);
    setElements((prev) => [...prev, e]);
    if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId));
    focusCanvas([e.id]); // 加完就让画布聚焦到新元素
    // 撤销=删除新增；重做=重建
    pushHistory({ undo: async () => { await api.deleteElement(e.id); setElements((prev) => prev.filter((x) => x.id !== e.id)); }, redo: async () => { const ne = await api.createElement(pid, payload); setElements((prev) => [...prev, ne]); } });
    return e;
  }

  // 按「分类画板」条目创建子元素（带类别+技术栈+名称；pos 为右键处画布坐标，缺省用默认）
  async function addElementCategorized(parentId: number, item: PaletteItem, pos?: { x: number; y: number } | null) {
    const parent = elements.find((e) => e.id === parentId);
    if (!parent) return;
    await addElement(item.type as ElementType, parentId, { category: item.category, technology: item.tech, name: item.name, posX: pos?.x, posY: pos?.y });
  }

  // 一键生成常用系统模板
  async function applyTemplate(t: Template) {
    const sys = await api.createElement(pid, { level: 1, type: 'softwareSystem', name: t.name, category: t.category, technology: t.tech, parentId: null, posX: 360, posY: 200 });
    setElements((prev) => [...prev, sys]);
    let i = 0;
    for (const c of t.containers) {
      const e = await api.createElement(pid, {
        level: 2, type: 'container', name: c.name, category: c.category, technology: c.tech, parentId: sys.id,
        posX: sys.posX + CHILD_MIN_X + (i % 2) * 180,
        posY: sys.posY + CHILD_MIN_Y + Math.floor(i / 2) * 170,
      });
      setElements((prev) => [...prev, e]);
      i++;
    }
    setExpanded((prev) => new Set(prev).add(sys.id));
    setShowTemplates(false);
    showToast(`已生成「${t.name}」`);
  }

  // 为某元素添加子元素（类型由父级决定：System→Container，Container→Component）
  async function addChild(parentId: number) {
    const parent = elements.find((e) => e.id === parentId);
    if (!parent) return;
    const t = parent.type === 'softwareSystem' ? 'container' : 'component';
    await addElement(t, parentId);
  }

  // 复制某元素及其整棵子树（含内部关系）到剪贴板
  // 构建某元素整棵子树的「可重建」数据（含内部关系），用于复制/删除撤销
  function buildBundle(rootId: number) {
    const ids = [rootId, ...collectDescendants(elements, rootId)];
    const idSet = new Set(ids);
    const idToIdx = new Map<number, number>();
    ids.forEach((id, i) => idToIdx.set(id, i));
    const bundleElems = ids.map((id) => {
      const e = elements.find((x) => x.id === id)!;
      return {
        name: e.name, type: e.type, level: e.level, category: e.category ?? '', technology: e.technology,
        description: e.description, tags: e.tags,
        parentRef: e.parentId != null && idToIdx.has(e.parentId) ? idToIdx.get(e.parentId)! : null,
        posX: e.posX, posY: e.posY,
      };
    });
    const bundleRels = relationships
      .filter((r) => idSet.has(r.sourceId) && idSet.has(r.targetId))
      .map((r) => ({
        sourceRef: idToIdx.get(r.sourceId)!, targetRef: idToIdx.get(r.targetId)!,
        label: r.label, interaction: r.interaction, protocol: r.protocol, messages: r.messages,
        sourceContainerId: r.sourceContainerId ?? null, targetContainerId: r.targetContainerId ?? null,
      }));
    const root = elements.find((e) => e.id === rootId);
    return { rootId, parentId: root?.parentId ?? null, elements: bundleElems, relationships: bundleRels };
  }

  // 把剪贴板/删除暂存的子树真正创建出来（重做/粘贴共用），返回新根 id
  async function materializeBundle(bundle: CopyBundle, rootParentId: number | null, offsetX: number, offsetY: number): Promise<number | null> {
    const idMap = new Map<number, number>();
    for (let i = 0; i < bundle.elements.length; i++) {
      const c = bundle.elements[i];
      const isRoot = i === 0;
      const refParent = c.parentRef != null ? idMap.get(c.parentRef) ?? null : null;
      const newParentId = isRoot ? rootParentId : refParent;
      const e = await api.createElement(pid, {
        level: c.level, type: c.type as ElementType, name: c.name, category: c.category,
        technology: c.technology, description: c.description, tags: c.tags,
        parentId: newParentId, posX: c.posX + offsetX, posY: c.posY + offsetY,
      });
      idMap.set(i, e.id);
      setElements((prev) => [...prev, e]);
    }
    for (const r of bundle.relationships) {
      const s = idMap.get(r.sourceRef);
      const t = idMap.get(r.targetRef);
      if (s && t) {
        await api.createRelationship(pid, {
          sourceId: s, targetId: t, label: r.label, interaction: r.interaction, protocol: r.protocol,
          messages: r.messages, sourceContainerId: r.sourceContainerId ?? null, targetContainerId: r.targetContainerId ?? null,
        });
      }
    }
    return idMap.size ? idMap.get(0) ?? null : null;
  }

  function copySubtree(rootId: number) {
    const bundle = buildBundle(rootId);
    setClipboard(bundle);
    showToast(`已复制 ${bundle.elements.length} 个元素`);
  }

  // 粘贴：作为根元素放置（整体偏移），或作为某节点子元素放置
  async function pasteSubtree(parentId: number | null, offsetX: number, offsetY: number) {
    if (!clipboard || !clipboard.elements.length) return;
    await materializeBundle(clipboard, parentId, offsetX, offsetY);
    if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId));
    showToast(`已粘贴 ${clipboard.elements.length} 个元素`);
    reload();
  }

  // 粘贴为根（画布空白/顶栏）
  const pasteAsRoot = () => pasteSubtree(null, 60, 60);
  // 粘贴为某节点的子元素
  const pasteAsChild = (parentId: number) => {
    const parent = elements.find((e) => e.id === parentId);
    if (!parent) return;
    pasteSubtree(parentId, parent.posX + CHILD_MIN_X - (clipboard?.elements[0]?.posX ?? 0), parent.posY + CHILD_MIN_Y - (clipboard?.elements[0]?.posY ?? 0));
  };

  async function addEdge(sourceId: number, targetId: number) {
    const payload = { sourceId, targetId, label: 'uses', level: viewLevel };
    const r = await api.createRelationship(pid, payload);
    setRelationships((prev) => [...prev, r]);
    // 撤销=删除新增关系；重做=重建
    pushHistory({ undo: async () => { await api.deleteRelationship(r.id); setRelationships((prev) => prev.filter((x) => x.id !== r.id)); }, redo: async () => { const nr = await api.createRelationship(pid, payload); setRelationships((prev) => [...prev, nr]); } });
  }

  function moveElement(id: number, x: number, y: number) {
    setElements((prev) => prev.map((it) => (it.id === id ? { ...it, posX: x, posY: y } : it)));
  }
  async function commitElement(id: number, x: number, y: number) {
    // 父元素拖动时，把它所有后代按同样的位移一并平移（否则展开后子元素落到框外）
    const el = elements.find((e) => e.id === id);
    const oldX = el ? el.posX : x;
    const oldY = el ? el.posY : y;
    const dx = x - oldX;
    const dy = y - oldY;
    await api.updateElement(id, { posX: x, posY: y });
    if ((dx || dy) && el) {
      const desc = collectDescendants(elements, id);
      if (desc.length) {
        await Promise.all(
          desc.map((did) => {
            const d = elements.find((e) => e.id === did);
            return d ? api.updateElement(did, { posX: d.posX + dx, posY: d.posY + dy }) : Promise.resolve();
          }),
        );
        setElements((prev) =>
          prev.map((it) => (desc.includes(it.id) ? { ...it, posX: it.posX + dx, posY: it.posY + dy } : it)),
        );
      }
    }
    // 记录移动：undo=恢复移动前位置，redo=恢复移动后位置（含后代）
    if (posBeforeRef.current && (dx || dy)) {
      const before = posBeforeRef.current;
      posBeforeRef.current = null;
      const after = snapPos();
      pushHistory({ undo: () => restorePos(before), redo: () => restorePos(after) });
    }
  }

  // 删除元素并进入撤销历史（右键菜单与属性面板共用）
  async function deleteElementWithHistory(id: number) {
    const bundle = buildBundle(id);
    const rootParent = bundle.parentId;
    await api.deleteElement(id);
    setSelectedId(null);
    reload();
    showToast('已删除元素');
    let restoredRootId: number | null = null;
    pushHistory({
      undo: async () => {
        restoredRootId = await materializeBundle(bundle, rootParent, 0, 0);
        reload();
      },
      redo: async () => {
        if (restoredRootId != null) {
          await api.deleteElement(restoredRootId);
          const removedIds = new Set([restoredRootId, ...collectDescendants(elements, restoredRootId)]);
          setElements((prev) => prev.filter((e) => !removedIds.has(e.id)));
          reload();
        }
      },
    });
  }

  const selectedElement = elements.find((e) => String(e.id) === selectedId) || null;
  // 层级导航面包屑：根 → … → 选中元素
  const breadcrumb = useMemo(() => {
    const chain: Element[] = [];
    let cur = selectedElement;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId != null ? elements.find((e) => e.id === cur.parentId) || null : null;
    }
    return chain;
  }, [selectedElement, elements]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedEdge = relationships.find((r) => String(r.id) === selectedEdgeId) || null;
  const [view, setView] = useState('canvas');
  const [showTree, setShowTree] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [clipboard, setClipboard] = useState<CopyBundle | null>(null);
  const [layoutDir, setLayoutDir] = useState<'down' | 'right'>('down');
  const [showValidation, setShowValidation] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showUntraced, setShowUntraced] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [focusReq, setFocusReq] = useState<{ ids: string[]; n: number }>({ ids: [], n: 0 });
  const focusCanvas = (ids: number[]) => { setFocusReq((p) => ({ ids: ids.map(String), n: p.n + 1 })); };
  const [views, setViews] = useState<View[]>([]);
  const [currentViewId, setCurrentViewId] = useState<number | null>(null);
  const [theme] = useState<'light' | 'neon'>('neon');

  // 未追溯需求：没有「需求→元素」追溯链接的需求
  const untracedReqs = useMemo(() => {
    const linkedReqIds = new Set(traceLinks.filter((tr) => tr.fromType === 'requirement').map((tr) => tr.fromId));
    return requirements.filter((r) => !linkedReqIds.has(r.id));
  }, [requirements, traceLinks]);
  // 轻量 Toast：非阻塞提示（替代 alert）
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // ==== 撤销/重做 历史 ====
  type PosSnap = Array<{ id: number; posX: number; posY: number }>;
  type HistoryAction = { undo: () => Promise<void>; redo: () => Promise<void> };
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [future, setFuture] = useState<HistoryAction[]>([]);
  const posBeforeRef = useRef<PosSnap | null>(null);
  const snapPos = (): PosSnap => elements.map((e) => ({ id: e.id, posX: e.posX, posY: e.posY }));
  const beforeMutate = () => { posBeforeRef.current = snapPos(); };
  const pushHistory = (a: HistoryAction) => { setHistory((h) => [...h.slice(-49), a]); setFuture([]); };
  const restorePos = async (snap: PosSnap) => {
    await Promise.all(snap.map((p) => api.updateElement(p.id, { posX: p.posX, posY: p.posY })));
    setElements((prev) => prev.map((e) => { const s = snap.find((x) => x.id === e.id); return s ? { ...e, posX: s.posX, posY: s.posY } : e; }));
  };
  const doUndo = async () => {
    if (!history.length) { showToast('没有可撤销的操作'); return; }
    const a = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, a]);
    await a.undo();
    showToast('已撤销');
  };
  const doRedo = async () => {
    if (!future.length) { showToast('没有可重做的操作'); return; }
    const a = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, a]);
    await a.redo();
    showToast('已重做');
  };
  const currentPayload = () => JSON.stringify(elements.map((e) => ({ elemId: e.id, x: e.posX, y: e.posY })));
  const saveCurrentView = async () => {
    const payload = currentPayload();
    if (currentViewId) {
      const v = await api.updateView(currentViewId, { payload });
      setViews((prev) => prev.map((vv) => (vv.id === v.id ? v : vv)));
      showToast('已保存当前视图');
    } else {
      const v = await api.createView(pid, { name: '视图 ' + (views.length + 1), payload });
      setViews((prev) => [...prev, v]);
      setCurrentViewId(v.id);
      showToast('已保存为新视图');
    }
  };
  const newView = async () => {
    const name = '视图 ' + (views.length + 1);
    const payload = currentPayload();
    const v = await api.createView(pid, { name, payload });
    setViews((prev) => [...prev, v]);
    setCurrentViewId(v.id);
    showToast(`已新建视图「${name}」`);
  };
  const switchView = async (id: number) => {
    if (id === currentViewId) return;
    // 切换前先把当前视图位置存回
    if (currentViewId) {
      try { await api.updateView(currentViewId, { payload: currentPayload() }); } catch { /* ignore */ }
    }
    const v = views.find((vv) => vv.id === id);
    const positions: Array<{ elemId: number; x: number; y: number }> = v ? JSON.parse(v.payload || '[]') : [];
    await restorePos(positions.map((p) => ({ id: p.elemId, posX: p.x, posY: p.y })));
    setCurrentViewId(id);
    showToast(`已切换「${v?.name ?? '视图'}」`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {toast && <div className="toast">{toast}</div>}
      <nav className="nav">
        <div className="nav-title">功能模块</div>
        <button className={view === 'canvas' ? 'active' : ''} onClick={() => setView('canvas')}>画布</button>
        <button className={view === 'req' ? 'active' : ''} onClick={() => setView('req')}>需求</button>
        <button className={view === 'proto' ? 'active' : ''} onClick={() => setView('proto')}>原型</button>
        <button className={view === 'matrix' ? 'active' : ''} onClick={() => setView('matrix')}>追溯矩阵</button>
        <button className={view === 'impact' ? 'active' : ''} onClick={() => setView('impact')}>影响分析</button>
        <button className={view === 'ai' ? 'active' : ''} onClick={() => setView('ai')}>AI 与导出</button>
      </nav>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {err && <div className="muted" style={{ color: '#dc2626', padding: '0 12px' }}>{err}</div>}

        {view === 'canvas' && (
          <>
            <div className="canvasbar">
              <Link to="/" className="muted" style={{ textDecoration: 'none' }}>← 返回</Link>
              <strong>{project?.name || '…'}</strong>
              <div className="grow" />
              <span className="muted" style={{ fontSize: 12 }}>点元素上「展开」可查看内部，右键可添加/删除</span>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
                  placeholder="搜索元素 / 技术栈 / 类别…"
                  style={{ width: 180, padding: '5px 26px 5px 9px', fontSize: 12 }}
                />
                {searchTerm ? (
                  <button className="ghost sm" style={{ position: 'absolute', right: 2, top: 2, padding: '2px 5px', fontSize: 12 }} onClick={() => setSearchTerm('')}>✕</button>
                ) : null}
              </div>
              <span className="pill" style={{ color: '#dc2626', borderColor: '#dc2626', background: '#fef2f2', fontSize: 11 }}>红线 = 系统消息未落到容器（缺失）</span>
              <button className="ghost sm" onClick={() => applyLayout()}>自动布局</button>
              <button className="ghost sm" disabled={!history.length} onClick={() => doUndo()}>↶ 撤销</button>
              <button className="ghost sm" disabled={!future.length} onClick={() => doRedo()}>↷ 重做</button>
              <button className={`ghost sm ${showMore ? 'active' : ''}`} onClick={() => setShowMore(!showMore)} style={{ position: 'relative' }}>
                … 更多
                {showMore && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 8, width: 250, fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
                    <div className="menu-title">面板</div>
                    <div className="menu-item" onClick={() => { setShowTree(!showTree); setShowMore(false); }}>元素结构 {showTree ? '✓' : ''}</div>
                    <div className="menu-item" onClick={() => { setShowLegend(!showLegend); setShowMore(false); }}>图例 {showLegend ? '✓' : ''}</div>
                    <div className="menu-item" onClick={() => { setShowValidation(!showValidation); setShowMore(false); }}>校验 ({validation.length}) {showValidation ? '✓' : ''}</div>
                    <div className="menu-item" onClick={() => { setShowUntraced(!showUntraced); setShowMore(false); }}>未追溯 ({untracedReqs.length}) {showUntraced ? '✓' : ''}</div>
                    <div className="menu-sep" />
                    <div className="menu-title">页面</div>
                    <div className="menu-item" onClick={() => { setExpanded(new Set(elements.filter((e) => hasChildren(e.id)).map((e) => e.id))); setShowMore(false); }}>全部展开</div>
                    <div className="menu-item" onClick={() => { setExpanded(new Set()); setShowMore(false); }}>全部收起</div>
                    <div className="menu-item" onClick={() => { const nd = layoutDir === 'down' ? 'right' : 'down'; setLayoutDir(nd); applyLayout(nd); setShowMore(false); }}>{layoutDir === 'down' ? '⇩ 上下布局' : '⇨ 左右布局'}</div>
                    <div className="menu-sep" />
                    <div className="menu-title">视图</div>
                    <select value={currentViewId ?? ''} onChange={(e) => { const id = Number(e.target.value); if (id) switchView(id); setShowMore(false); }} style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}>
                      {views.length === 0 && <option value="">无视图</option>}
                      {views.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
                    </select>
                    <div className="menu-item" onClick={() => { saveCurrentView(); setShowMore(false); }}>存为视图</div>
                    <div className="menu-item" onClick={() => { newView(); setShowMore(false); }}>+ 新建视图</div>
                    <div className="menu-sep" />
                    <div className="menu-title">操作</div>
                    <div className="menu-item" onClick={() => { if (clipboard) pasteAsRoot(); setShowMore(false); }}>粘贴</div>
                    <div className="menu-item" onClick={() => setShowTemplates(!showTemplates)}>模板 {showTemplates ? '✓' : ''}</div>
                    {showTemplates && TEMPLATES.map((t) => (
                      <div key={t.id} className="menu-item" style={{ paddingLeft: 18 }} onClick={() => { applyTemplate(t); setShowMore(false); }}>↳ {t.name}</div>
                    ))}
                  </div>
                )}
              </button>
              <span style={{ width: 8 }} />
              <div className="adds">
                {TYPES[1].map((t) => (
                  <button key={t} className="primary sm" onClick={() => addElement(t)}>+ {TYPE_LABEL[t]}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              {showTree && (
                <aside style={{ width: 250, borderRight: '1px solid var(--border)', background: 'var(--surface)', overflow: 'auto' }}>
                  <ElementTree
                    elements={elements}
                    expanded={expanded}
                    onSelect={(id) => setSelectedId(String(id))}
                    onExpand={expand}
                    onReparent={async (childId, newParentId) => {
                      const parent = newParentId != null ? elements.find((e) => e.id === newParentId) : null;
                      try {
                        await api.updateElement(childId, { parentId: newParentId, level: parent ? parent.level + 1 : 1 });
                        reload();
                      } catch (err: any) {
                        // eslint-disable-next-line no-alert
                        alert((err as Error).message || '调整层级失败');
                      }
                    }}
                  />
                </aside>
              )}
              <div style={{ flex: 1, position: 'relative' }}>
                <C4Canvas
                  elements={visibleElements}
                  allElements={elements}
                  allRelationships={relationships}
                  overridePositions={displayPos}
                  contextIds={contextIds}
                  selectedId={selectedId}
                  selectedEdgeId={selectedEdgeId}
                  searchTerm={searchTerm}
                  theme={theme}
                  focusRequest={focusReq}
                  hasChildren={hasChildren}
                  onToggleExpand={expand}
                  onSelect={setSelectedId}
                  onSelectEdge={setSelectedEdgeId}
                  onAddEdge={addEdge}
                  onMoveElement={moveElement}
                  onMoveElementCommit={commitElement}
                  onMoveStart={beforeMutate}
                  addTypes={TYPES[1]}
                  onAddType={(t, pos) => addElement(t, null, pos ? { posX: pos.x, posY: pos.y } : undefined)}
                  onAddChild={(id) => addChild(id)}
                  onAddChildType={(id, item, pos) => addElementCategorized(id, item, pos)}
                  onDelete={async (id) => {
                    if (!window.confirm('确定删除该元素？其下所有子元素、关系与追溯都会被删除。')) return;
                    await deleteElementWithHistory(id);
                  }}
                  onCopy={(id) => copySubtree(id)}
                  onPasteChild={(id) => pasteAsChild(id)}
                  onPasteRoot={() => pasteAsRoot()}
                  hasClipboard={!!clipboard}
                />
                {breadcrumb.length > 0 && (
                  <div className="crumb" style={{ position: 'absolute', top: 44, left: 12, zIndex: 10, background: 'rgba(255,255,255,.9)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 12, boxShadow: 'var(--shadow)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {breadcrumb.map((b, i) => (
                      <span key={b.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {i > 0 && <span className="muted">/</span>}
                        <a className="crumb-link" style={{ color: i === breadcrumb.length - 1 ? 'var(--text)' : '#2563eb', cursor: 'pointer', fontWeight: i === breadcrumb.length - 1 ? 700 : 500 }} onClick={() => setSelectedId(String(b.id))}>
                          {b.name}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                {showUntraced && (
                  <div style={{ position: 'absolute', top: 12, right: 272, zIndex: 10, background: 'rgba(255,255,255,.96)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 12, width: 250, fontSize: 12, maxHeight: '70vh', overflow: 'auto' }}>
                    <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>未追溯需求（未关联元素）</div>
                    {untracedReqs.length === 0 ? (
                      <div className="muted" style={{ fontSize: 12 }}>全部需求都已关联元素 ✅</div>
                    ) : (
                      untracedReqs.map((r) => (
                        <div key={r.id} className="menu-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }} onClick={() => { setView('req'); setShowUntraced(false); }}>
                          <span className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || r.code}</span>
                          <span className="pill warn" style={{ fontSize: 10 }}>{r.priority || '中'}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {showValidation && (
                  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,.96)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 12, width: 260, fontSize: 12, maxHeight: '70vh', overflow: 'auto' }}>
                    <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>校验：缺失的消息（红线）</div>
                    {validation.length === 0 ? (
                      <div className="muted" style={{ fontSize: 12 }}>当前没有缺失，所有系统消息都已落到叶子 ✅</div>
                    ) : (
                      validation.map((v, i) => (
                        <div
                          key={i}
                          className="menu-item"
                          style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}
                          onClick={() => { setSelectedId(null); setSelectedEdgeId(String(v.relationshipId)); setView('canvas'); }}
                        >
                          <span className="muted" style={{ fontSize: 12 }}>{v.sName} → {v.tName}</span>
                          <span className="pill warn" style={{ fontSize: 10 }}>{v.label}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {showLegend && (
                  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: 'rgba(255,255,255,.96)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 12, width: 230, fontSize: 12 }}>
                    <div className="muted" style={{ fontWeight: 700, marginBottom: 6 }}>图例</div>
                    <div className="muted" style={{ marginBottom: 4 }}>元素类别</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {CATEGORY_LIST.map((c) => (
                        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={c.label}>
                          <span style={{ color: c.color }}>{c.icon}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="muted" style={{ margin: '8px 0 4px' }}>关系</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 22, height: 0, borderTop: '2px solid #94a3b8' }} /> <span className="muted" style={{ fontSize: 11 }}>同步（实线实心箭头）</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 22, height: 0, borderTop: '2px dashed #94a3b8' }} /> <span className="muted" style={{ fontSize: 11 }}>异步（虚线）</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 22, height: 0, borderTop: '2px solid #dc2626' }} /> <span className="muted" style={{ fontSize: 11 }}>红线 = 缺失（未落到叶子）</span>
                      </div>
                    </div>
                    <div className="muted" style={{ margin: '8px 0 4px' }}>协议配色</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {([['#8b5cf6','gRPC'],['#f59e0b','Kafka/MQ'],['#0d9488','SQL'],['#2563eb','REST/HTTP'],['#dc2626','Redis']] as Array<[string,string]>).map(([c, l]) => (
                        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                          <span className="muted" style={{ fontSize: 10 }}>{l}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {visibleElements.length === 0 && (
                  <div className="empty" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(255,255,255,.94)', borderRadius: 14, padding: '22px 30px', boxShadow: 'var(--shadow)', pointerEvents: 'none' }}>
                    <div className="big">🧭</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>这里还是空的</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      <>点击「+ Software System」添加系统；点元素上的「展开」查看其内部；右键可添加子元素或删除。</>
                    </div>
                  </div>
                )}
              </div>
              <aside style={{ width: 320, borderLeft: '1px solid #e5e7eb', background: '#fff', overflow: 'auto' }}>
                {selectedEdge ? (
                  <EdgeInspector
                    edge={selectedEdge}
                    elements={elements}
                    onSave={async (e) => {
                      const updated = await api.updateRelationship(e.id, { ...e });
                      setRelationships((prev) => prev.map((it) => (it.id === e.id ? { ...it, ...e, id: it.id } : it)));
                      setSelectedEdgeId(String(updated && updated.id ? updated.id : e.id));
                    }}
                    onDelete={async (eid) => {
                      if (!window.confirm('确定删除这条连接关系？')) return;
                      await api.deleteRelationship(eid);
                      setSelectedEdgeId(null);
                      reload();
                    }}
                  />
                ) : (
                  <Inspector
                    element={selectedElement}
                    onAiDesign={async () => {
                      if (!selectedElement) return;
                      try {
                        const r = await api.aiDesign(pid, { name: selectedElement.name, type: selectedElement.type, description: selectedElement.description });
                        if (r.draft && r.draft.elements?.length) {
                          const res = await api.aiApply(pid, r.draft);
                          // eslint-disable-next-line no-alert
                          alert(`AI 已生成该块的详细结构：${res.elements} 个元素、${res.relationships} 条关系`);
                          reload();
                        } else {
                          // eslint-disable-next-line no-alert
                          alert('AI 未识别出结构，请重试或检查 AI 配置');
                        }
                      } catch (err: any) {
                        // eslint-disable-next-line no-alert
                        alert((err as Error).message || 'AI 设计失败');
                      }
                    }}
                    onSave={async (e) => {
                      const updated = await api.updateElement(e.id, { ...e });
                      const id = updated && updated.id ? updated.id : e.id;
                      setSelectedId(String(id));
                      setElements((prev) => prev.map((it) => (it.id === e.id ? { ...it, ...e, id: it.id } : it)));
                    }}
                    onDelete={async (eid) => {
                      if (!window.confirm('确定删除该元素？其下所有子元素、关系与追溯都会被删除。')) return;
                      await deleteElementWithHistory(eid);
                    }}
                  />
                )}
              </aside>
            </div>
          </>
        )}

        {view === 'req' && (
          <div className="page">
            <div className="page-header"><h2>需求</h2><div className="sub">录入/导入需求，并把每条需求挂接到对应容器元素，形成「需求 → 容器」的反向追溯。</div></div>
            <RequirementsTab pid={pid} requirements={requirements} elements={elements.filter((e) => e.level === 2)} traceLinks={traceLinks} onChanged={reload} />
          </div>
        )}
        {view === 'proto' && (
          <div className="page">
            <div className="page-header"><h2>界面原型</h2><div className="sub">上传截图或粘贴 URL/Figma，并把原型挂接到对应容器（容器 → 界面原型）。</div></div>
            <PrototypesTab pid={pid} prototypes={prototypes} containerElements={elements.filter((e) => e.level === 2)} traceLinks={traceLinks} onChanged={reload} />
          </div>
        )}
        {view === 'matrix' && (
          <div className="page">
            <div className="page-header"><h2>追溯矩阵</h2><div className="sub">汇总每个元素关联的需求与原型，一目了然地看追溯缺口。</div></div>
            <MatrixTab pid={pid} />
          </div>
        )}
        {view === 'impact' && (
          <div className="page">
            <div className="page-header"><h2>影响分析</h2><div className="sub">选择一个元素/需求，沿追溯链与容器关系扩散出受影响对象，用于需求变更评估。</div></div>
            <ImpactTab pid={pid} elements={elements} requirements={requirements} />
          </div>
        )}
        {view === 'ai' && (
          <div className="page">
            <div className="page-header"><h2>AI 与导出</h2><div className="sub">用 AI 生成/校验架构，或导入/导出 Structurizr DSL、JSON、Markdown、HTML、SVG、PNG。</div></div>
            <AiTab pid={pid} elements={visibleElements} relationships={visibleRelationships} onApply={reload} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Inspector ----
function Inspector({ element, onAiDesign, onSave, onDelete }: { element: Element | null; onAiDesign: () => void; onSave: (e: Element) => void; onDelete: (id: number) => void }) {
  const [form, setForm] = useState<Element | null>(null);
  useEffect(() => setForm(element), [element]);
  if (!element || !form)
    return (
      <div style={{ padding: 20 }} className="muted">
        选中元素后可编辑属性。在画布上点击一个元素。
      </div>
    );
  const set = (k: keyof Element, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <div style={{ padding: 16 }}>
      <label>类型</label>
      <select value={form.type} onChange={(e) => set('type', e.target.value)}>
        {Object.entries(TYPE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <label>名称</label>
      <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      <label>描述</label>
      <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
      <label>技术栈</label>
      <ComboInput
        value={form.technology}
        options={TECH_PRESETS}
        placeholder="选择或输入技术栈"
        onChange={(v) => {
          setForm((f) => {
            if (!f) return f;
            const cat = categoryForTech(v);
            return cat && (f.category == null || f.category === '') ? { ...f, technology: v, category: cat } : { ...f, technology: v };
          });
        }}
      />
      <label>类别</label>
      <input value={form.category ?? ''} placeholder="database / backend / frontend / queue / cache" onChange={(e) => set('category', e.target.value)} />
      <label>标签</label>
      <input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
      <label>层级</label>
      <select value={form.level} onChange={(e) => set('level', Number(e.target.value))}>
        <option value={1}>Context</option>
        <option value={2}>Container</option>
        <option value={3}>Component</option>
      </select>
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
        <button onClick={onAiDesign}>AI 生成该块详细结构</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => onSave(form)}>保存</button>
        <button className="danger" onClick={() => onDelete(form.id)}>删除</button>
      </div>
    </div>
  );
}

// ---- 连线（关系）检查器 ----
function EdgeInspector({ edge, elements, onSave, onDelete }: { edge: Relationship; elements: Element[]; onSave: (e: Relationship) => void; onDelete: (id: number) => void }) {
  const [form, setForm] = useState<Relationship | null>(null);
  const [msgs, setMsgs] = useState<RelationshipMessage[]>([]);
  useEffect(() => {
    setForm(edge);
    setMsgs(parseMessages(edge));
  }, [edge]);
  if (!form)
    return <div style={{ padding: 20 }} className="muted">选中连接线后可编辑交互信息。</div>;
  const nameOf = (id: number) => elements.find((e) => e.id === id)?.name || `#${id}`;
  // 层级选择器：取 parent 下的所有「叶子」后代（无子级的容器/组件），label 带层级路径
  const leafDescendants = (parentId: number): { id: number; label: string }[] => {
    const out: { id: number; label: string }[] = [];
    const walk = (pid: number, path: string[]) => {
      (elements.filter((e) => e.parentId === pid)).forEach((c) => {
        const hasKids = elements.some((e) => e.parentId === c.id);
        if (hasKids) walk(c.id, [...path, c.name]);
        else out.push({ id: c.id, label: [...path, c.name].join(' / ') });
      });
    };
    walk(parentId, []);
    return out;
  };
  const sourceLeaves = leafDescendants(form.sourceId);
  const targetLeaves = leafDescendants(form.targetId);
  const setMsg = (i: number, k: keyof RelationshipMessage, v: any) => setMsgs((m) => m.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addMsg = () => setMsgs((m) => [...m, { name: '', protocol: '', senderId: null, receiverId: null }]);
  const delMsg = (i: number) => setMsgs((m) => m.filter((_, j) => j !== i));
  const save = () => {
    const arr = msgs.map((x) => ({ name: x.name || '消息', protocol: x.protocol || '', senderId: x.senderId ?? null, receiverId: x.receiverId ?? null }));
    const body = {
      ...form,
      interaction: arr[0]?.name ?? '',
      label: arr[0]?.name ?? '',
      protocol: arr[0]?.protocol ?? '',
      sourceContainerId: arr[0]?.senderId ?? null,
      targetContainerId: arr[0]?.receiverId ?? null,
      messages: JSON.stringify(arr),
    };
    onSave(body);
  };
  return (
    <div style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {nameOf(form.sourceId)} → {nameOf(form.targetId)}
      </div>
      <label>交互信息</label>
      {msgs.map((m, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ComboInput value={m.name} options={INTERACTION_PRESETS} onChange={(v) => setMsg(i, 'name', v)} placeholder="交互内容/消息名" width="100%" />
            <button className="ghost sm" onClick={() => delMsg(i)}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {sourceLeaves.length > 0 && (
              <select value={m.senderId ?? ''} style={{ maxWidth: 200 }} onChange={(e) => setMsg(i, 'senderId', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">发送端(未指定→红)</option>
                {sourceLeaves.map((c) => <option key={c.id} value={c.id}>发·{c.label}</option>)}
              </select>
            )}
            {targetLeaves.length > 0 && (
              <select value={m.receiverId ?? ''} style={{ maxWidth: 200 }} onChange={(e) => setMsg(i, 'receiverId', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">接收端(未指定→红)</option>
                {targetLeaves.map((c) => <option key={c.id} value={c.id}>收·{c.label}</option>)}
              </select>
            )}
            <ComboInput value={m.protocol} options={PROTOCOL_PRESETS} onChange={(v) => setMsg(i, 'protocol', v)} placeholder="协议" width={120} />
          </div>
        </div>
      ))}
      <button className="ghost sm" onClick={addMsg}>+ 添加消息</button>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save}>保存</button>
        <button className="danger" onClick={() => onDelete(form.id)}>删除</button>
      </div>
    </div>
  );
}

// ---- 需求 ----
function RequirementsTab({ pid, requirements, elements, traceLinks, onChanged }: { pid: number; requirements: Requirement[]; elements: Element[]; traceLinks: TraceLink[]; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [prio, setPrio] = useState('medium');
  const [showImport, setShowImport] = useState(false);
  const [md, setMd] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [csv, setCsv] = useState('');

  async function add() {
    if (!title.trim()) return;
    try {
      await api.createRequirement(pid, { code, title, description: desc, priority: prio });
      setTitle('');
      setDesc('');
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '添加失败');
    }
  }

  async function importMd() {
    if (!md.trim()) return;
    try {
      const r = await api.importRequirements(pid, md);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      setMd('');
      setShowImport(false);
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '导入失败');
    }
  }

  async function importCsv() {
    if (!csv.trim()) return;
    try {
      const r = await api.importRequirementsCsv(pid, csv);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      setCsv('');
      setShowCsv(false);
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '导入失败');
    }
  }

  async function importXlsx(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await api.importRequirementsExcel(pid, f);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      onChanged();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert((err as Error).message || '导入失败');
    } finally {
      e.target.value = '';
    }
  }

  const linksOf = (reqId: number) => traceLinks.filter((l) => l.fromType === 'requirement' && l.fromId === reqId);
  const linked = new Set(requirements.map((r) => r.id).filter((rid) => linksOf(rid).length > 0));
  const untraced = requirements.filter((r) => !linked.has(r.id));

  return (
    <div>
      {untraced.length > 0 && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--warning)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill warn">{untraced.length} 条未追溯</span>
            <strong>以下需求未关联任何元素：</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {untraced.map((r) => r.title).join('、')}
            </span>
          </div>
        </div>
      )}
      <div className="grid2">
        <div>
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div className="title">新增需求</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <button className="sm" onClick={() => setShowImport(!showImport)}>导入 Markdown</button>
                {showImport && <button className="primary sm" onClick={importMd}>导入</button>}
                <button className="sm" onClick={() => setShowCsv(!showCsv)}>导入 CSV</button>
                {showCsv && <button className="primary sm" onClick={importCsv}>导入</button>}
                <label className="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: 0 }}>
                  导入 Excel
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importXlsx} />
                </label>
              </div>
            </div>
            {showImport && (
              <textarea rows={4} placeholder="粘贴 Markdown 需求（标题/列表行作为需求，支持 [R1] 编号）…" value={md} onChange={(e) => setMd(e.target.value)} style={{ marginBottom: 10 }} />
            )}
            {showCsv && (
              <textarea rows={4} placeholder={"粘贴 CSV：表头 code,title,description,priority,status,tags\n示例：R1,用户下单,支持下单,high,active"} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ marginBottom: 10 }} />
            )}
            <div className="row">
              <input placeholder="编号（可选）" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 96 }} />
              <input placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} className="grow" />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <textarea placeholder="描述" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="grow" />
              <select value={prio} onChange={(e) => setPrio(e.target.value)} style={{ width: 110 }}>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
              <button className="primary" onClick={add}>添加</button>
            </div>
          </div>
          <div className="list">
            {requirements.length === 0 && <div className="empty"><div className="big">📋</div><div>暂无需求。手动添加或导入。</div></div>}
            {requirements.map((r) => (
              <div key={r.id} className="card">
                <div className="row between">
                  <div>
                    <span style={{ fontWeight: 600 }}>{r.code ? `[${r.code}] ` : ''}{r.title}</span>
                    <span className={`pill ${['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'info'}`} style={{ marginLeft: 8 }}>{prioLabel(r.priority)}</span>
                  </div>
                  <button className="danger sm" onClick={async () => { if (!window.confirm('确定删除该需求？')) return; await api.deleteRequirement(r.id); onChanged(); }}>删除</button>
                </div>
                {r.description && <div className="subs">{r.description}</div>}
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>挂接元素：</span>
                  <select
                    defaultValue=""
                    onChange={async (e) => {

                      const elId = Number(e.target.value);
                      if (elId) {
                        try {
                          await api.createTraceLink(pid, { fromType: 'requirement', fromId: r.id, toType: 'element', toId: elId, linkType: 'satisfies' });
                          onChanged();
                        } catch (err: any) {
                          // eslint-disable-next-line no-alert
                          alert((err as Error).message || '关联失败');
                        }
                      }
                    }}
                    style={{ maxWidth: 240 }}
                  >
                    <option value="">选择元素…</option>
                    {elements.map((el) => (
                      <option key={el.id} value={el.id}>{el.name}</option>
                    ))}
                  </select>
                </div>
                <div className="subs" style={{ marginTop: 4 }}>
                  已关联：{linksOf(r.id).length === 0 ? '无' : linksOf(r.id).map((l) => elements.find((e) => e.id === l.toId)?.name).filter(Boolean).join('、')}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel muted" style={{ fontSize: 13 }}>
          <strong>说明</strong>
          <div style={{ marginTop: 6 }}>把每条需求挂接到对应容器元素，形成「需求 → 容器」的追溯。顶部会汇总未被追溯的需求。</div>
        </div>
      </div>
    </div>
  );
}


// ---- 原型 ----
function PrototypesTab({ pid, prototypes, containerElements, traceLinks, onChanged }: { pid: number; prototypes: Prototype[]; containerElements: Element[]; traceLinks: TraceLink[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function addImage() {
    if (!file) return;
    const fd = new FormData();
    fd.append('name', name || file.name);
    fd.append('type', 'image');
    fd.append('file', file);
    await api.uploadPrototype(pid, fd);
    setName('');
    setFile(null);
    onChanged();
  }
  async function addUrl() {
    if (!url.trim()) return;
    await api.createPrototypeLink(pid, { name: name || url, type: 'url', uri: url });
    setName('');
    setUrl('');
    onChanged();
  }

  const linksOf = (protoId: number) => traceLinks.filter((l) => l.fromType === 'element' && l.toType === 'prototype' && l.toId === protoId);
  const containerName = (id: number) => containerElements.find((e) => e.id === id)?.name;

  return (
    <div className="grid2">
      <div>
        <div className="row">
          <input placeholder="原型名称" value={name} onChange={(e) => setName(e.target.value)} className="grow" />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="primary" onClick={addImage}>上传图片</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input placeholder="原型 URL / Figma 链接" value={url} onChange={(e) => setUrl(e.target.value)} className="grow" />
          <button className="primary" onClick={addUrl}>添加链接</button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {prototypes.length === 0 && <div className="empty"><div className="big">🖼️</div><div>暂无原型。上传截图或添加链接。</div></div>}
          {prototypes.map((p) => (
            <div key={p.id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {p.type === 'image' ? (
                  <img src={p.uri} alt={p.name} style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ) : (
                  <a href={p.uri} target="_blank" rel="noreferrer" className="pill info" style={{ flexShrink: 0, textDecoration: 'none' }}>打开链接 ↗</a>
                )}
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="subs">
                    挂接容器：{linksOf(p.id).length === 0 ? '无' : linksOf(p.id).map((l) => containerName(l.fromId)).filter(Boolean).join('、')}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <select
                      defaultValue=""
                      onChange={async (e) => {
                        const elId = Number(e.target.value);
                        if (elId) {
                          try {
                            await api.createTraceLink(pid, { fromType: 'element', fromId: elId, toType: 'prototype', toId: p.id, linkType: 'shows' });
                            onChanged();
                          } catch (err: any) {
                            // eslint-disable-next-line no-alert
                            alert((err as Error).message || '关联失败');
                          }
                        }
                      }}
                      style={{ maxWidth: 240 }}
                    >
                      <option value="">选择容器…</option>
                      {containerElements.map((el) => (
                        <option key={el.id} value={el.id}>{el.name}</option>
                      ))}
                    </select>
                    <button className="danger sm" onClick={async () => { if (!window.confirm('确定删除该原型？')) return; await api.deletePrototype(p.id); onChanged(); }}>删除</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel muted" style={{ fontSize: 13 }}>
        <strong>说明</strong>
        <div>上传界面截图或链接到原型；再将其挂接到某个容器元素，形成“容器 → 界面原型”的追溯。</div>
      </div>
    </div>
  );
}

// ---- 追溯矩阵 ----
function MatrixTab({ pid }: { pid: number }) {
  const [rows, setRows] = useState<TraceMatrixRow[]>([]);
  useEffect(() => {
    api.getMatrix(pid).then(setRows).catch(() => setRows([]));
  }, [pid]);
  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>元素</th>
              <th>层级</th>
              <th>关联需求</th>
              <th>关联原型</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.elementId}>
                <td>{r.elementName}</td>
                <td><span className="pill info">{LEVEL_NAME[r.level]}</span></td>
                <td>{r.requirementText || '—'}</td>
                <td>{r.prototypeText || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="empty"><div className="big">🔗</div><div>暂无元素。先在画布上建模。</div></div>}
    </div>
  );
}

// ---- 影响分析 ----
function ImpactTab({ pid, elements, requirements }: { pid: number; elements: Element[]; requirements: Requirement[] }) {
  const [type, setType] = useState('element');
  const [oid, setOid] = useState<string>('');
  const [result, setResult] = useState<ImpactResult | null>(null);

  const items: any[] = type === 'element' ? elements : type === 'requirement' ? requirements : [];

  async function run() {
    if (!oid) return;
    setResult(await api.getImpact(pid, type, Number(oid)));
  }

  return (
    <div className="grid2">
      <div>
        <div className="row">
          <select value={type} onChange={(e) => { setType(e.target.value); setOid(''); }}>
            <option value="element">元素</option>
            <option value="requirement">需求</option>
          </select>
          <select value={oid} onChange={(e) => setOid(e.target.value)} className="grow">
            <option value="">选择对象…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{(it as any).name || (it as any).title}</option>
            ))}
          </select>
          <button className="primary" onClick={run}>分析影响</button>
        </div>
        {result && (
          <div className="panel" style={{ marginTop: 10 }}>
            <div>影响对象：<strong>{result.root.name}</strong></div>
            <div className="muted" style={{ margin: '6px 0' }}>受影响（{result.affected.length}）：</div>
            <div className="list">
              {result.affected.map((n, i) => (
                <div key={i} className="card" style={{ display: 'flex', gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{n.type}</span>
                  <span>{n.name}</span>
                </div>
              ))}
              {result.affected.length === 0 && <div className="muted">无直接影响对象。</div>}
            </div>
          </div>
        )}
      </div>
      <div className="panel muted" style={{ fontSize: 13 }}>
        <strong>说明</strong>
        <div>选择一个元素或需求，系统沿追溯链与容器关系扩散，列出所有受影响的对象，用于需求变更评估。</div>
      </div>
    </div>
  );
}

// ---- AI 与导出 ----
function AiTab({ pid, elements, relationships, onApply }: { pid: number; elements: Element[]; relationships: Relationship[]; onApply: () => void }) {
  const [text, setText] = useState('');
  const [aiOut, setAiOut] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [validateOut, setValidateOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [dsl, setDsl] = useState('');
  const [ruleIssues, setRuleIssues] = useState<{ type: string; message: string }[]>([]);
  const [showDsl, setShowDsl] = useState(false);
  const [codeDir, setCodeDir] = useState('');
  const [codeOut, setCodeOut] = useState('');
  const [codeSummary, setCodeSummary] = useState('');

  async function gen() {
    setBusy(true);
    setApplied(false);
    try {
      const r = await api.aiGenerate(pid, text);
      setAiOut(r.text);
      setDraft(r.draft);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '生成失败');
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api.aiApply(pid, draft);
      setApplied(true);
      onApply();
      // eslint-disable-next-line no-alert
      alert(`已应用 ${r.elements} 个元素、${r.relationships} 条关系`);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '采纳失败');
    } finally {
      setBusy(false);
    }
  }
  async function val() {
    setBusy(true);
    try {
      const r = await api.aiValidate(pid, 'all');
      setValidateOut(r.text);
      setIssues(r.issues || []);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '校验失败');
    } finally {
      setBusy(false);
    }
  }
  async function checkRules() {
    setBusy(true);
    try {
      setRuleIssues(await api.rulesValidate(pid));
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '静态校验失败');
    } finally {
      setBusy(false);
    }
  }
  async function importDsl() {
    if (!dsl.trim()) return;
    setBusy(true);
    try {
      const r = await api.importDSL(pid, dsl);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.elements} 个元素、${r.relationships} 条关系`);
      setDsl('');
      setShowDsl(false);
      onApply();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || 'DSL 导入失败');
    } finally {
      setBusy(false);
    }
  }
  async function inferCode() {
    if (!codeDir.trim()) return;
    setBusy(true);
    setApplied(false);
    try {
      const r = await api.aiCode(pid, codeDir.trim());
      setCodeOut(r.text);
      setCodeSummary(r.summary || '');
      setDraft(r.draft);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '代码推断失败');
    } finally {
      setBusy(false);
    }
  }
  async function downloadPng() {
    const el = document.querySelector('.react-flow') as HTMLElement | null;
    if (!el) {
      // eslint-disable-next-line no-alert
      alert('请先切换到画布视图');
      return;
    }
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, { cacheBust: true, backgroundColor: '#f8fafc', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `archlens-${pid}.png`;
      a.click();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || 'PNG 导出失败');
    }
  }
  async function download(format: string) {
    const content = await api.exportProject(pid, format);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `archlens-${pid}.${format === 'markdown' ? 'md' : format}`;
    a.click();
  }
  function downloadSvg() {
    const svg = buildSVG(elements, relationships);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `archlens-${pid}-diagram.svg`;
    a.click();
  }

  return (
    <div className="grid2">
      <div>
        <textarea rows={4} placeholder="粘贴需求/一段描述…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" onClick={gen} disabled={busy}>生成 C4 初稿</button>
        {draft && (
          <div className="panel" style={{ marginTop: 8 }}>
            <div className="row">
              <span style={{ fontWeight: 600 }}>
                识别到 {draft.elements?.length ?? 0} 元素、{draft.relationships?.length ?? 0} 关系
              </span>
              <button className="primary" onClick={apply} disabled={busy}>应用到画布</button>
            </div>
            {applied && <div className="muted" style={{ marginTop: 6, color: '#16a34a' }}>已应用，可在画布查看。</div>}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>AI 结果仅作初稿，应用后仍可编辑。</div>
          </div>
        )}
        {aiOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{aiOut}</pre>
        )}
      </div>
      <div>
        <button onClick={val} disabled={busy}>AI 一致性校验</button>
        {issues.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {issues.map((it, i) => (
              <div key={i} className="card" style={{ fontSize: 13 }}>{it}</div>
            ))}
          </div>
        )}
        {validateOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{validateOut}</pre>
        )}
      </div>
      <div className="row" style={{ gridColumn: '1 / -1' }}>
        <span className="muted" style={{ fontSize: 13 }}>导出（git 友好）：</span>
        <button onClick={() => download('dsl')}>Structurizr DSL</button>
        <button onClick={() => download('json')}>JSON</button>
        <button onClick={() => download('markdown')}>Markdown</button>
        <button className="primary" onClick={downloadSvg}>SVG（当前层级）</button>
        <button onClick={downloadPng}>PNG</button>
        <button onClick={() => download('html')}>HTML 报告</button>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <input placeholder="本地代码目录，如 D:\myapp（推断组件与依赖）" value={codeDir} onChange={(e) => setCodeDir(e.target.value)} className="grow" />
          <button className="primary" onClick={inferCode} disabled={busy}>代码仓库推断</button>
        </div>
        {codeSummary && (
          <details style={{ marginBottom: 8 }}>
            <summary className="muted" style={{ fontSize: 12 }}>查看代码摘要</summary>
            <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{codeSummary}</pre>
          </details>
        )}
        {codeOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 8 }}>{codeOut}</pre>
        )}
        <div className="row">
          <button onClick={() => setShowDsl(!showDsl)}>导入 Structurizr DSL</button>
          {showDsl && <button className="primary" onClick={importDsl} disabled={busy}>导入</button>}
          <button onClick={checkRules} disabled={busy}>静态校验（规则引擎）</button>
        </div>
        {showDsl && (
          <textarea
            rows={4}
            placeholder={'粘贴 Structurizr DSL：\nworkspace "X" {\n  model {\n    softwareSystem "订单系统" {\n      container "库存服务"\n    }\n    "库存服务" -> "支付服务" "调用"\n  }\n}'}
            value={dsl}
            onChange={(e) => setDsl(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}
        {ruleIssues.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {ruleIssues.map((it, i) => (
              <div key={i} className="card" style={{ fontSize: 13 }}>
                <span className="muted" style={{ marginRight: 6 }}>[{it.type}]</span>
                {it.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SVG_KIND: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};
const SVG_COLOR: Record<string, string> = {
  person: '#7c3aed',
  softwareSystem: '#0f766e',
  container: '#1d4ed8',
  component: '#b45309',
};

function escapeXml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

// buildSVG 根据当前层级的元素与关系生成自包含 SVG 图。
function buildSVG(elements: Element[], relationships: Relationship[]): string {
  const W = 1000;
  const H = 700;
  if (elements.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f8fafc"/><text x="20" y="40" fill="#6b7280">当前层级暂无元素</text></svg>`;
  }
  const sizeOf = (t: string) =>
    t === 'softwareSystem' ? { w: 220, h: 110 } : t === 'container' ? { w: 170, h: 92 } : t === 'component' ? { w: 140, h: 78 } : { w: 96, h: 84 };
  const nodes = elements.map((e) => {
    const s = sizeOf(e.type);
    return { id: e.id, x: e.posX, y: e.posY, w: s.w, h: s.h, type: e.type, name: e.name };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  const pad = 40;
  const scale = Math.min(1, (W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY));
  const px = (x: number) => pad + (x - minX) * scale;
  const py = (y: number) => pad + (y - minY) * scale;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#f8fafc"/>`);
  for (const r of relationships) {
    const s = nodes.find((n) => n.id === r.sourceId);
    const t = nodes.find((n) => n.id === r.targetId);
    if (!s || !t) continue;
    const sx = px(s.x) + s.w * scale;
    const sy = py(s.y) + (s.h * scale) / 2;
    const tx = px(t.x);
    const ty = py(t.y) + (t.h * scale) / 2;
    parts.push(`<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#64748b" stroke-width="1.5"/>`);
    parts.push(`<polygon points="${tx},${ty} ${tx - 9},${ty - 4.5} ${tx - 9},${ty + 4.5}" fill="#64748b"/>`);
    parts.push(`<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 6}" font-size="11" fill="#475569" text-anchor="middle">${escapeXml(r.label || 'uses')}</text>`);
  }
  for (const n of nodes) {
    const x = px(n.x);
    const y = py(n.y);
    const w = n.w * scale;
    const h = n.h * scale;
    const c = SVG_COLOR[n.type] || '#94a3b8';
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="${c}" stroke-width="2"/>`);
    parts.push(`<text x="${x + w / 2}" y="${y + 20}" font-size="10" fill="#64748b" text-anchor="middle">${escapeXml(SVG_KIND[n.type] || n.type)}</text>`);
    parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 14}" font-size="14" font-weight="600" fill="#1f2937" text-anchor="middle">${escapeXml(n.name)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
