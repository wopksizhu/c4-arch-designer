import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
  MarkerType,
} from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import '@xyflow/react/dist/style.css';
import type { Element, Relationship } from '../types';
import { computeExtent, clampChildPos } from '../lib/geometry';
import { buildEdges } from '../lib/edges';
import { paletteFor, type PaletteItem } from '../lib/palette';
import { metaFor, protocolColor, isAsync } from '../lib/visual';

const kindLabel: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};
const c4Cls: Record<string, string> = {
  person: 'c4-person',
  softwareSystem: 'c4-system',
  container: 'c4-container',
  component: 'c4-component',
};

// ---------- 普通元素节点 ----------
type C4NodeData = { label: string; description: string; elementType: string; isParent: boolean; canExpand: boolean; expanded: boolean; canAdd: boolean; category?: string; technology?: string; dim?: boolean; relCount?: number; theme?: 'light' | 'neon'; srcAnchors?: Array<{ id: string; side: Position; frac: number }>; tgtAnchors?: Array<{ id: string; side: Position; frac: number }> };
type C4NodeType = Node<C4NodeData, 'c4'>;

let addChildHandler: ((id: number) => void) | null = null;
let expandHandler: ((id: number) => void) | null = null;
let connectStartHandler: ((nodeId: number, sx: number, sy: number) => void) | null = null;

const handleStyle: CSSProperties = { width: 12, height: 12, background: '#94a3b8', border: '2px solid #fff' };

// 源/目标句柄：仅用于 React Flow 计算连线贴边（隐藏不可见），连线交互走自定义「框体自由连线」。
function NodeHandles({ color }: { color?: string }) {
  const hs: CSSProperties = { ...(color ? { width: 11, height: 11, background: color, border: '2px solid #0b0a10', boxShadow: `0 0 6px ${color}` } : handleStyle), opacity: 0, pointerEvents: 'none' };
  return (
    <>
      <Handle type="source" id="s-right" position={Position.Right} style={hs} />
      <Handle type="source" id="s-bottom" position={Position.Bottom} style={hs} />
      <Handle type="target" id="t-left" position={Position.Left} style={hs} />
      <Handle type="target" id="t-top" position={Position.Top} style={hs} />
    </>
  );
}

// 依据两节点相对方向定「连线贴靠的边」：正向(目标在右)用 右→左；其余自适应就近边
function pickPositions(s: { x: number; y: number }, t: { x: number; y: number }): { sp: Position; tp: Position } {
  const dx = t.x - s.x, dy = t.y - s.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { sp: Position.Right, tp: Position.Left } : { sp: Position.Left, tp: Position.Right };
  }
  return dy >= 0 ? { sp: Position.Bottom, tp: Position.Top } : { sp: Position.Top, tp: Position.Bottom };
}

// 求「源中心→目标中心」的射线穿出节点单位框(中心0,0,半宽0.5)的出口边+比例(0=上/左,1=下/右)。
// 每条线据此在框体边界上得到独立锚点 → 多条线自然散开，不挤在一点。
function computeExit(sx: number, sy: number, tx: number, ty: number, force?: 'bottom' | 'top'): { side: Position; frac: number } {
  const dx = tx - sx, dy = ty - sy;
  const adx = Math.max(Math.abs(dx), 1e-6), ady = Math.max(Math.abs(dy), 1e-6);
  let side: Position;
  let frac: number;
  if (force === 'bottom') { side = Position.Bottom; frac = Math.max(0.15, Math.min(0.85, (dx / ady) * 0.5 + 0.5)); }
  else if (force === 'top') { side = Position.Top; frac = Math.max(0.15, Math.min(0.85, (dx / ady) * 0.5 + 0.5)); }
  else if (adx >= ady) {
    side = dx >= 0 ? Position.Right : Position.Left;
    frac = (dy / adx) * 0.5 + 0.5;
  } else {
    side = dy >= 0 ? Position.Bottom : Position.Top;
    frac = (dx / ady) * 0.5 + 0.5;
  }
  frac = Math.max(0.15, Math.min(0.85, frac));
  return { side, frac };
}

// 按出口边+比例生成句柄样式：水平边用 top:%，垂直边用 left:%
function anchorStyle(side: Position, frac: number, color: string): CSSProperties {
  const base: CSSProperties = { position: 'absolute', width: 8, height: 8, background: color, border: '2px solid #0b0a10', borderRadius: '50%', opacity: 0, pointerEvents: 'none', zIndex: 4 };
  if (side === Position.Right) return { ...base, right: -4, top: `${frac * 100}%`, transform: 'translateY(-50%)' };
  if (side === Position.Left) return { ...base, left: -4, top: `${frac * 100}%`, transform: 'translateY(-50%)' };
  if (side === Position.Bottom) return { ...base, bottom: -4, left: `${frac * 100}%`, transform: 'translateX(-50%)' };
  return { ...base, top: -4, left: `${frac * 100}%`, transform: 'translateX(-50%)' };
}

// 自定义边：把连接线上的多条消息渲染成逐条堆叠的标签
type MsgEdgeData = { relationshipId?: number; messageLabels?: string[]; neon?: boolean; sourceColor?: string; targetColor?: string; curvature?: number; solid?: boolean; solidColor?: string; active?: boolean };
type MsgEdgeType = Edge<MsgEdgeData, 'messageEdge'>;

function MessageEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps<MsgEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: data?.curvature ?? 0.2 });
  const labels = data?.messageLabels && data.messageLabels.length ? data.messageLabels : ['uses'];
  const color = (style as any)?.stroke || '#475569';
  const isNeon = data?.neon;
  const active = !!data?.active;
  const strokeW = active ? 3 : 1.3;
  return (
    <>
      {isNeon ? (
        <>
          <defs>
            <marker id={`${id}-arr`} markerWidth="10" markerHeight="10" refX="9" refY="2.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M9,2.5 C7,4.4 4.2,5.2 0,5.2 C2.8,3.9 2.8,1.1 0,-0.2 C4.2,-0.2 7,0.6 9,2.5 Z" fill={data?.solid ? data?.solidColor : data?.targetColor || '#888'} />
            </marker>
            {!data?.solid && (
              <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={data?.sourceColor || '#888'} />
                <stop offset="100%" stopColor={data?.targetColor || '#888'} />
              </linearGradient>
            )}
          </defs>
          <path
            d={path}
            fill="none"
            stroke={data?.solid ? data?.solidColor : `url(#${id}-grad)`}
            strokeWidth={strokeW}
            strokeLinecap="round"
            markerEnd={`url(#${id}-arr)`}
            style={{ filter: active ? `drop-shadow(0 0 6px ${data?.solid ? data?.solidColor : data?.sourceColor || '#888'})` : `drop-shadow(0 0 2px ${data?.solid ? data?.solidColor : data?.sourceColor || '#888'}66)` }}
          />
          <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ pointerEvents: 'stroke' }} />
        </>
      ) : (
        <BaseEdge path={path} style={style} markerEnd={markerEnd} />
      )}
      {active && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              alignItems: 'center',
              pointerEvents: 'all',
              zIndex: 5,
            }}
          >
            {labels.map((l, i) => (
              <div
                key={i}
                data-edge-label="1"
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  padding: '1px 8px',
                  borderRadius: 6,
                  background: isNeon ? '#151320' : '#fff',
                  border: isNeon ? `1px solid ${data?.sourceColor || '#555'}` : '1px solid #e2e8f0',
                  color: isNeon ? '#e6e6f0' : color,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  boxShadow: isNeon ? `0 1px 4px rgba(0,0,0,.4)` : '0 1px 2px rgba(0,0,0,.06)',
                }}
              >
                {l}
              </div>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { messageEdge: MessageEdge };

// 让 C4Canvas 拿到 ReactFlow 实例（用于 screenToFlowPosition 把右键坐标换算为画布坐标）
function ViewportCapture({ onReady }: { onReady: (rf: any) => void }) {
  const rf = useReactFlow();
  useEffect(() => { onReady(rf); }, [rf, onReady]);
  return null;
}

// 画布导出 PNG/SVG：计算全部节点边界，临时 fit 到整图后捕获
function ExportControls() {
  const { getNodes, setViewport, getViewport } = useReactFlow();
  const [busy, setBusy] = useState(false);
  const download = async (kind: 'png' | 'svg') => {
    setBusy(true);
    try {
      const nodes = getNodes();
      if (!nodes.length) return;
      const bounds = getNodesBounds(nodes);
      const width = 1280;
      const height = 800;
      const vp = getViewportForBounds(bounds, width, height, 0.4, 2, 0);
      const prev = getViewport();
      setViewport(vp);
      await new Promise((r) => setTimeout(r, 120));
      const el = document.querySelector('.react-flow__viewport') as HTMLElement;
      const dataUrl = await (kind === 'png' ? toPng : toSvg)(el, { backgroundColor: '#ffffff' });
      setViewport(prev);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `archlens.${kind}`;
      a.click();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '导出失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, zIndex: 20 }}>
      <button className="ghost sm" disabled={busy} onClick={() => download('png')}>导出 PNG</button>
      <button className="ghost sm" disabled={busy} onClick={() => download('svg')}>导出 SVG</button>
    </div>
  );
}

function C4Node({ data, id }: NodeProps<C4NodeType>) {
  const kind = data?.elementType ? kindLabel[data.elementType] || data.elementType : '';
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  const label = data?.label || `#${id}`;
  const meta = metaFor({ category: data?.category, type: data?.elementType, technology: data?.technology });
  const neon = data?.theme === 'neon';
  const catLabel = data?.category || kind;
  return (
    <div
      className={neon ? 'c4-neon' : `c4-node ${cls}`}
      style={neon
        ? { borderColor: meta.color, boxShadow: `0 0 18px ${meta.color}44, inset 0 0 12px ${meta.color}1a`, opacity: data?.dim ? 0.25 : 1 }
        : { borderLeft: `3px solid ${meta.color}`, opacity: data?.dim ? 0.22 : 1 }}
    >
      {neon ? (
        <div className="c4-neon-row">
          <div className="c4-neon-icon" style={{ borderColor: meta.color, color: meta.color }}>{meta.icon}</div>
          <div className="c4-neon-body">
            <div className="c4-neon-title">{label}</div>
            <div className="c4-neon-cat" style={{ color: meta.color }}>{catLabel}</div>
            {data?.description ? <div className="c4-neon-desc">{data.description}</div> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="c4-icon" style={{ color: meta.color }}>{meta.icon}</div>
          <div className="kind">{kind}</div>
          <div className="name">
            {label}
            {data?.technology ? <span className="c4-tech"> · {data.technology}</span> : null}
          </div>
          {data?.description ? <div className="desc">{data.description}</div> : null}
        </>
      )}
      <div className="c4-actions nodrag">
        {data?.canExpand && (
          <button className="c4-toggle" title={data.expanded ? '收起' : '展开'} onClick={(e) => { e.stopPropagation(); e.preventDefault(); expandHandler && expandHandler(Number(id)); }}>
            {data.expanded ? '▾' : '▸'}
          </button>
        )}
        {data?.canAdd && (
          <button className="c4-drill" title="添加子元素" onClick={(e) => { e.stopPropagation(); e.preventDefault(); addChildHandler && addChildHandler(Number(id)); }}>＋</button>
        )}
      </div>
      <div className="c4-tip">
        <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{kind}</div>
        {data?.technology ? <div style={{ fontSize: 11 }}>技术栈：{data.technology}</div> : null}
        {data?.description ? <div style={{ fontSize: 11, marginTop: 2 }}>{data.description}</div> : null}
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>关系：{data?.relCount ?? 0} 条</div>
      </div>
      <div
        className="c4-connect nodrag"
        onMouseDown={(e) => { if (e.button === 0) { e.stopPropagation(); e.preventDefault(); connectStartHandler && connectStartHandler(Number(id), e.clientX, e.clientY); } }}
      />
      {(data?.srcAnchors || []).map((a) => (
        <Handle key={a.id} type="source" id={a.id} position={a.side} style={anchorStyle(a.side, a.frac, neon ? meta.color : '#94a3b8')} />
      ))}
      {(data?.tgtAnchors || []).map((a) => (
        <Handle key={a.id} type="target" id={a.id} position={a.side} style={anchorStyle(a.side, a.frac, neon ? meta.color : '#94a3b8')} />
      ))}
      <NodeHandles color={neon ? meta.color : undefined} />
    </div>
  );
}

// ---------- 边界框（System/Container 分组，子元素画在框内） ----------
type BoundaryData = { label: string; elementType: string; expanded: boolean; category?: string; technology?: string; dim?: boolean; srcAnchors?: Array<{ id: string; side: Position; frac: number }>; tgtAnchors?: Array<{ id: string; side: Position; frac: number }> };
type BoundaryNodeType = Node<BoundaryData, 'boundary'>;

function BoundaryNode({ data, id }: NodeProps<BoundaryNodeType>) {
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  const meta = metaFor({ category: data?.category, type: data?.elementType, technology: data?.technology });
  return (
    <div className={`c4-boundary ${cls}`}>
      <div className="c4-boundary-header">
        <span className="c4-boundary-icon" style={{ color: meta.color }}>{meta.icon}</span>
        <span className="c4-boundary-name">{data?.label || id}</span>
        {data?.technology ? <span className="c4-tech"> · {data.technology}</span> : null}
        <button className="c4-toggle" onClick={(e) => { e.stopPropagation(); expandHandler && expandHandler(Number(id)); }}>
          {data?.expanded ? '▾ 收起' : '▸ 展开'}
        </button>
      </div>
      <div className="c4-boundary-body" />
      {(data?.srcAnchors || []).map((a) => (
        <Handle key={a.id} type="source" id={a.id} position={a.side} style={anchorStyle(a.side, a.frac, meta.color)} />
      ))}
      {(data?.tgtAnchors || []).map((a) => (
        <Handle key={a.id} type="target" id={a.id} position={a.side} style={anchorStyle(a.side, a.frac, meta.color)} />
      ))}
      <NodeHandles />
    </div>
  );
}

const nodeTypes = { c4: C4Node, boundary: BoundaryNode };

interface BuildOpts {
  hasChildren: (id: number) => boolean;
  expanded: Set<number>;
  contextIds: Set<number>;
  searchTerm: string;
  relCount: Map<number, number>;
  theme: 'light' | 'neon';
  anchors: Map<number, { sources: Array<{ id: string; side: Position; frac: number }>; targets: Array<{ id: string; side: Position; frac: number }> }>;
}

// 自下而上递归计算每个元素的「边界框尺寸」已迁移至 lib/geometry

function buildNodes(elements: Element[], o: BuildOpts): Node[] {
  const byParent = new Map<number, Element[]>();
  elements.forEach((e) => { const a = byParent.get(e.parentId ?? -1) || []; a.push(e); byParent.set(e.parentId ?? -1, a); });

  const memo = new Map<number, { w: number; h: number }>();
  elements.forEach((e) => computeExtent(e, byParent, o.expanded, memo));

  const term = o.searchTerm.trim().toLowerCase();
  const match = (e: Element) => !term || (e.name || '').toLowerCase().includes(term) || (e.technology || '').toLowerCase().includes(term) || (e.category || '').toLowerCase().includes(term);

  return elements.map((e) => {
    const kids = o.expanded.has(e.id) ? byParent.get(e.id) || [] : [];
    if (kids.length) {
      const ex = memo.get(e.id)!;
      return {
        id: String(e.id),
        type: 'boundary',
        position: { x: e.posX, y: e.posY },
        style: { width: ex.w, height: ex.h, opacity: term && !match(e) ? 0.22 : 1 },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: e.name, elementType: e.type, expanded: o.expanded.has(e.id), category: e.category, technology: e.technology, dim: term && !match(e), srcAnchors: o.anchors.get(e.id)?.sources ?? [], tgtAnchors: o.anchors.get(e.id)?.targets ?? [] } as BoundaryData,
      };
    }
    return {
      id: String(e.id),
      type: 'c4',
      position: { x: e.posX, y: e.posY },
      zIndex: 0,
      data: {
        label: e.name, description: e.description, elementType: e.type,
        isParent: false,
        canExpand: o.hasChildren(e.id),
        expanded: o.expanded.has(e.id),
        canAdd: (e.type === 'softwareSystem' || e.type === 'container') && !o.hasChildren(e.id),
        category: e.category,
        technology: e.technology,
        dim: term && !match(e),
        relCount: o.relCount.get(e.id) ?? 0,
        theme: o.theme,
        srcAnchors: o.anchors.get(e.id)?.sources ?? [],
        tgtAnchors: o.anchors.get(e.id)?.targets ?? [],
      } as C4NodeData,
    };
  });
}

type Props = {
  elements: Element[];
  allElements: Element[];
  allRelationships: Relationship[];
  overridePositions?: Map<number, { x: number; y: number }>;
  contextIds?: Set<number>;
  selectedId?: string | null;
  selectedEdgeId?: string | null;
  searchTerm?: string;
  cycleEdges?: Set<number>;
  theme?: 'light' | 'neon';
  hasChildren: (id: number) => boolean;
  onToggleExpand: (id: number) => void;
  onSelect: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onAddEdge: (sourceId: number, targetId: number) => void;
  onMoveElement: (id: number, x: number, y: number) => void;
  onMoveElementCommit: (id: number, x: number, y: number) => void;
  onMoveStart: () => void;
  addTypes: string[];
  onAddType: (t: string, pos?: { x: number; y: number } | null) => void;
  onAddChild: (id: number) => void;
  onAddChildType: (id: number, item: PaletteItem, pos?: { x: number; y: number } | null) => void;
  onDelete: (id: number) => void;
  onCopy: (id: number) => void;
  onPasteChild: (id: number) => void;
  onPasteRoot: () => void;
  hasClipboard: boolean;
};

export default function C4Canvas({
  elements,
  allElements,
  allRelationships,
  overridePositions,
  contextIds = new Set(),
  selectedId = null,
  selectedEdgeId = null,
  searchTerm = '',
  cycleEdges = new Set(),
  theme = 'light',
  hasChildren,
  onToggleExpand,
  onSelect,
  onSelectEdge,
  onAddEdge,
  onMoveElement,
  onMoveElementCommit,
  onMoveStart,
  addTypes,
  onAddType,
  onAddChild,
  onAddChildType,
  onDelete,
  onCopy,
  onPasteChild,
  onPasteRoot,
  hasClipboard,
}: Props) {
  addChildHandler = onAddChild;
  expandHandler = onToggleExpand;
  // ==== 自定义「框体自由连线」：抓主体任意处连到另一框体 ====
  const [conn, setConn] = useState<{ sourceId: number; sx: number; sy: number; cx: number; cy: number; targetId: number | null } | null>(null);
  const connRef = useRef<typeof conn>(null);
  const onConnMove = useCallback((e: PointerEvent) => {
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('.react-flow__node');
    const tid = el ? Number(el.getAttribute('data-id') || el.getAttribute('data-nodeid')) : null;
    setConn((c) => (c ? { ...c, cx: e.clientX, cy: e.clientY, targetId: tid } : c));
  }, []);
  const onConnUp = useCallback((e: PointerEvent) => {
    const c = connRef.current;
    window.removeEventListener('pointermove', onConnMove);
    window.removeEventListener('pointerup', onConnUp);
    window.removeEventListener('pointercancel', onConnUp);
    if (!c) return;
    const moved = Math.hypot(e.clientX - c.sx, e.clientY - c.sy) > 6;
    if (!moved) {
      onSelect(String(c.sourceId)); // 点击主体=选中
    } else if (c.targetId != null && c.targetId !== c.sourceId) {
      onAddEdge(c.sourceId, c.targetId); // 拖到另一框体=建连
    }
    setConn(null);
  }, [onAddEdge, onSelect]);
  const startConn = useCallback((nodeId: number, sx: number, sy: number) => {
    const state = { sourceId: nodeId, sx, sy, cx: sx, cy: sy, targetId: null };
    connRef.current = state;
    setConn(state);
    window.addEventListener('pointermove', onConnMove);
    window.addEventListener('pointerup', onConnUp);
    window.addEventListener('pointercancel', onConnUp);
  }, [onConnMove, onConnUp]);
  useEffect(() => { connRef.current = conn; }, [conn]);
  connectStartHandler = startConn; // 暴露给节点主体热区
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const flowPosRef = useRef<{ x: number; y: number } | null>(null);
  const rfRef = useRef<any>(null);
  // 右键打开菜单时，把屏幕坐标换算为画布坐标，供「添加子元素」放在鼠标处
  const openMenu = (x: number, y: number, nodeId: string | null) => {
    setMenu({ x, y, nodeId });
    try {
      const fp = rfRef.current?.screenToFlowPosition?.({ x, y });
      flowPosRef.current = fp ? { x: fp.x, y: fp.y } : null;
    } catch {
      flowPosRef.current = null;
    }
  };

  // 右键菜单：钳制在视口内（不超屏）+ 点击菜单外关闭
  useEffect(() => {
    if (!menu) return;
    const el = menuRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = menu.x;
      let y = menu.y;
      if (rect.right > vw - 8) x = vw - rect.width - 8;
      if (rect.bottom > vh - 8) y = vh - rect.height - 8;
      if (x !== menu.x || y !== menu.y) setMenu((m) => (m ? { ...m, x: Math.max(8, x), y: Math.max(8, y) } : m));
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as globalThis.Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  // 展示层坐标覆盖（仅用于渲染，不写库）：展开时的最小化布局在此生效，收起后自动还原
  const renderElements = useMemo(() => {
    if (!overridePositions || overridePositions.size === 0) return elements;
    return elements.map((e) => {
      const p = overridePositions.get(e.id);
      return p ? { ...e, posX: p.x, posY: p.y } : e;
    });
  }, [elements, overridePositions]);

  const relCount = useMemo(() => {
    const m = new Map<number, number>();
    allRelationships.forEach((r) => { m.set(r.sourceId, (m.get(r.sourceId) || 0) + 1); m.set(r.targetId, (m.get(r.targetId) || 0) + 1); });
    return m;
  }, [allRelationships]);
  const elMap = useMemo(() => new Map(renderElements.map((e) => [e.id, e])), [renderElements]);
  const visibleNum = useMemo(() => new Set(elements.map((e) => e.id)), [elements]);
  const edgeDrafts = useMemo(() => buildEdges(allRelationships, allElements, visibleNum, contextIds), [allRelationships, allElements, visibleNum, contextIds]);
  // 按「有向 (source→target)」分组：同向并行 / 双向每个方向内部，各自均匀错开，避免多条线重叠
  const pairFan = useMemo(() => {
    const groups = new Map<string, string[]>();
    edgeDrafts.forEach((d) => {
      const k = `${d.sourceId}|${d.targetId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(d.id);
    });
    const of = new Map<string, { index: number; count: number }>();
    groups.forEach((list) => { const c = list.length; list.forEach((id, i) => of.set(id, { index: i, count: c })); });
    return of;
  }, [edgeDrafts]);
  // 为每条边在其源/目标节点边界上求独立「锚点」（出/入口），多条线错开比例散开
  const anchors = useMemo(() => {
    const m = new Map<number, { sources: Array<{ id: string; side: Position; frac: number }>; targets: Array<{ id: string; side: Position; frac: number }> }>();
    const ensure = (nid: number) => { if (!m.has(nid)) m.set(nid, { sources: [], targets: [] }); return m.get(nid)!; };
    edgeDrafts.forEach((d) => {
      const s = elMap.get(d.sourceId);
      const t = elMap.get(d.targetId);
      if (!s || !t) return;
      const f = pairFan.get(d.id) || { index: 0, count: 1 };
      // 有向组内均匀错开：同向并行/双向各方向内部等距铺开，线多也不重叠
      const frac = f.count > 1 ? 0.16 + (f.index / (f.count - 1)) * 0.68 : 0.5;
      let srcSide: Position;
      let tgtSide: Position;
      if (d.arc) {
        // 反向边绕到“另一侧”：水平排布走下边(bottom)，垂直堆叠走左边(left)，避开正向直线
        const dx = t.posX - s.posX, dy = t.posY - s.posY;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        srcSide = horizontal ? Position.Bottom : Position.Left;
        tgtSide = srcSide;
      } else {
        const se = computeExit(s.posX, s.posY, t.posX, t.posY, undefined);
        const te = computeExit(t.posX, t.posY, s.posX, s.posY, undefined);
        srcSide = se.side; tgtSide = te.side;
      }
      ensure(d.sourceId).sources.push({ id: `s-${d.id}`, side: srcSide, frac });
      ensure(d.targetId).targets.push({ id: `t-${d.id}`, side: tgtSide, frac });
    });
    return m;
  }, [edgeDrafts, elMap, pairFan]);
  const nodes = useMemo<Node[]>(() => buildNodes(renderElements, { hasChildren, expanded: contextIds, contextIds, searchTerm, relCount, theme, anchors }), [renderElements, hasChildren, contextIds, searchTerm, relCount, theme, anchors]);
  const edges = useMemo<Edge[]>(() => {
    return edgeDrafts.map((d) => {
      const linked = selectedId != null && (String(d.sourceId) === selectedId || String(d.targetId) === selectedId);
      // 标签：折叠态=多条消息名（逐条堆叠），展开态=单条消息（可带协议）
      const messageLabels = d.label.split('\n').filter(Boolean);
      const labelForTag = d.protocol && messageLabels.length === 1 ? `${messageLabels[0]} · ${d.protocol}` : d.label;
      const tags = labelForTag.split('\n').filter(Boolean);
      // 每条线用独立锚点（s-<edgeId>/t-<edgeId>），按相对方向求边
      const s = elMap.get(d.sourceId);
      const t = elMap.get(d.targetId);
      let spPos: Position | undefined;
      let tpPos: Position | undefined;
      if (d.arc && s && t) {
        const dx = t.posX - s.posX, dy = t.posY - s.posY;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        spPos = horizontal ? Position.Bottom : Position.Left;
        tpPos = spPos;
      } else {
        const hp = s && t ? pickPositions({ x: s.posX, y: s.posY }, { x: t.posX, y: t.posY }) : undefined;
        spPos = hp?.sp;
        tpPos = hp?.tp;
      }
      const protoColor = protocolColor(d.protocol);
      const inCycle = cycleEdges.has(d.relationshipId);
      const isNeon = theme === 'neon';
      const srcMeta = s ? metaFor({ category: (s as any).category, type: (s as any).type, technology: (s as any).technology }) : null;
      const tgtMeta = t ? metaFor({ category: (t as any).category, type: (t as any).type, technology: (t as any).technology }) : null;
      const baseColor = d.missing ? '#dc2626' : inCycle ? '#f59e0b' : linked ? '#2563eb' : protoColor || '#94a3b8';
      const asyncEdge = isAsync(d.label, d.protocol);
      const f = pairFan.get(d.id) || { index: 0, count: 1 };
      const curvature = d.arc ? 0.25 : f.count > 1 ? 0.2 : 0.18;
      return {
        id: d.id,
        source: String(d.sourceId),
        target: String(d.targetId),
        type: 'messageEdge',
        sourceHandle: `s-${d.id}`,
        targetHandle: `t-${d.id}`,
        sourcePosition: spPos,
        targetPosition: tpPos,
        data: { relationshipId: d.relationshipId, messageLabels: tags, neon: isNeon, sourceColor: srcMeta?.color || baseColor, targetColor: tgtMeta?.color || baseColor, curvature, solid: d.missing || inCycle || linked, solidColor: baseColor, active: hoverEdgeId === d.id || selectedEdgeId === String(d.relationshipId) },
        animated: linked,
        markerEnd: { type: MarkerType.ArrowClosed, color: baseColor, width: 18, height: 18 },
        style: {
          stroke: baseColor,
          strokeWidth: d.missing || linked || inCycle ? 2 : 1.5,
          strokeDasharray: inCycle ? '4 3' : asyncEdge ? '6 4' : undefined,
        },
      };
    });
  }, [edgeDrafts, pairFan, selectedId, selectedEdgeId, hoverEdgeId, elMap, cycleEdges, theme]);

  const [nodeState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgeState, setEdges, onEdgesChange] = useEdgesState(edges);
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  // 子元素拖拽约束：向左/上不得超出父框，向右/下自由（框体随之自适应）
  const childParent = useMemo(() => {
    const m = new Map<number, Element>();
    elements.forEach((e) => {
      if (e.parentId != null) {
        const p = elements.find((pp) => pp.id === e.parentId);
        if (p) m.set(e.id, p);
      }
    });
    return m;
  }, [elements]);

  // 取子元素父级的「渲染后」坐标（展示层布局下父框可能被移动，钳制要相对显示位置）
  const renderedParentOf = useCallback(
    (childId: number): Element | undefined => {
      const base = childParent.get(childId);
      if (!base) return undefined;
      const ov = overridePositions?.get(base.id);
      return ov ? { ...base, posX: ov.x, posY: ov.y } : base;
    },
    [childParent, overridePositions],
  );

  const clampedOnNodesChange = useCallback(
    (changes: any[]) => {
      const next = changes.map((ch) => {
        if (ch.type === 'position' && ch.position) {
          const idNum = Number(ch.id);
          const parent = renderedParentOf(idNum);
          if (parent) {
            const c = clampChildPos(parent, ch.position.x, ch.position.y);
            if (c.x !== ch.position.x || c.y !== ch.position.y) {
              return { ...ch, position: c };
            }
          }
        }
        return ch;
      });
      onNodesChange(next);
    },
    [onNodesChange, renderedParentOf],
  );

  const onConnect = useCallback((c: Connection) => { if (c.source && c.target) onAddEdge(Number(c.source), Number(c.target)); }, [onAddEdge]);

  const onPaneCtx = useCallback((e: any) => { e.preventDefault(); openMenu(e.clientX, e.clientY, null); }, []);
  const onNodeCtx = useCallback((e: any, node: Node) => { e.preventDefault(); openMenu(e.clientX, e.clientY, node.id); }, []);

  const onDragStop = useCallback((_e: unknown, node: Node) => {
    const idNum = Number(node.id);
    const parent = renderedParentOf(idNum);
    const c = clampChildPos(parent, node.position.x, node.position.y);
    onMoveElement(idNum, c.x, c.y);
    onMoveElementCommit(idNum, c.x, c.y);
  }, [onMoveElement, onMoveElementCommit, renderedParentOf]);

  return (
    <ReactFlow
      nodes={nodeState}
      edges={edgeState}
      className={theme === 'neon' ? 'rf-neon' : 'rf-light'}
      onNodesChange={clampedOnNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeClick={(_e, edge) => { onSelect(null); onSelectEdge(String(edge.data?.relationshipId ?? edge.id)); setMenu(null); }}
      onEdgeMouseEnter={(_e, edge) => setHoverEdgeId(edge.id)}
      onEdgeMouseLeave={() => setHoverEdgeId(null)}
      onNodeClick={(_e, node) => { onSelect(node.id); onSelectEdge(null); setMenu(null); }}
      onPaneClick={() => { onSelect(null); onSelectEdge(null); setMenu(null); }}
      onNodeContextMenu={onNodeCtx}
      onPaneContextMenu={onPaneCtx}
      onNodeDragStop={onDragStop}
      onNodeDragStart={() => onMoveStart()}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      style={{ height: '100%' }}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
      <ViewportCapture onReady={(rf) => { rfRef.current = rf; }} />
      <ExportControls />
      {conn && (
        <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 40 }}>
          <path
            d={`M ${conn.sx} ${conn.sy} C ${conn.sx + (conn.cx - conn.sx) * 0.5} ${conn.sy}, ${conn.sx + (conn.cx - conn.sx) * 0.5} ${conn.cy}, ${conn.cx} ${conn.cy}`}
            fill="none"
            stroke={conn.targetId && conn.targetId !== conn.sourceId ? '#16a34a' : '#2563eb'}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            style={{ filter: 'drop-shadow(0 0 3px rgba(37,99,235,.6))' }}
          />
        </svg>
      )}
      {menu && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 1200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', minWidth: 180, padding: 6 }}
          onClick={() => setMenu(null)}
        >
          {menu.nodeId ? (
            <div style={{ maxHeight: '70vh', overflow: 'auto', minWidth: 220 }}>
              <div className="menu-title">添加子元素</div>
              {(() => {
                const pe = elements.find((e) => String(e.id) === menu.nodeId);
                const groups = pe ? paletteFor(pe) : [];
                return groups.map((g) => (
                  <div key={g.title}>
                    <div className="menu-group">{g.title}</div>
                    {g.items.map((it) => (
                      <div key={it.id} className="menu-item" onClick={() => { onAddChildType(Number(menu.nodeId), it, flowPosRef.current); setMenu(null); }}>
                        {it.icon}&nbsp;{it.label}
                      </div>
                    ))}
                  </div>
                ));
              })()}
              <div className="menu-sep" />
              <div className="menu-item" onClick={() => { if (hasChildren(Number(menu.nodeId))) { onToggleExpand(Number(menu.nodeId)); setMenu(null); } }}>展开 / 收起</div>
              <div className="menu-item" onClick={() => { if (menu.nodeId) onCopy(Number(menu.nodeId)); setMenu(null); }}>复制元素</div>
              {hasClipboard && (
                <div className="menu-item" onClick={() => { if (menu.nodeId) onPasteChild(Number(menu.nodeId)); setMenu(null); }}>粘贴为子元素</div>
              )}
              <div className="menu-item" onClick={() => { if (menu.nodeId) onDelete(Number(menu.nodeId)); setMenu(null); }}>删除元素</div>
            </div>
          ) : (
            <div>
              {addTypes.map((t) => (
                <div key={t} className="menu-item" onClick={() => { onAddType(t, flowPosRef.current); setMenu(null); }}>+ 添加 {kindLabel[t] || t}</div>
              ))}
              {hasClipboard && (
                <div className="menu-item" onClick={() => { onPasteRoot(); setMenu(null); }}>粘贴元素</div>
              )}
            </div>
          )}
        </div>
      )}
    </ReactFlow>
  );
}
