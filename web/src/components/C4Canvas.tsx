import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Element, Relationship } from '../types';

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

const NODE_W = 200;
const NODE_H = 100;
const PAD = 50;

// ---------- 普通元素节点 ----------
type C4NodeData = { label: string; description: string; elementType: string; isParent: boolean; canExpand: boolean; expanded: boolean; canAdd: boolean };
type C4NodeType = Node<C4NodeData, 'c4'>;

let addChildHandler: ((id: number) => void) | null = null;
let expandHandler: ((id: number) => void) | null = null;

function C4Node({ data, id }: NodeProps<C4NodeType>) {
  const kind = data?.elementType ? kindLabel[data.elementType] || data.elementType : '';
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  const label = data?.label || `#${id}`;
  return (
    <div className={`c4-node ${cls}`}>
      <div className="kind">{kind}</div>
      <div className="name">{label}</div>
      {data?.description ? <div className="desc">{data.description}</div> : null}
      <div className="c4-actions">
        {data?.canExpand && (
          <button className="c4-toggle" onClick={(e) => { e.stopPropagation(); expandHandler && expandHandler(Number(id)); }}>
            {data.expanded ? '▾ 收起' : '▸ 展开'}
          </button>
        )}
        {data?.canAdd && (
          <button className="c4-drill" onClick={(e) => { e.stopPropagation(); addChildHandler && addChildHandler(Number(id)); }}>+ 添加子元素</button>
        )}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// ---------- 边界框（System/Container 分组，子元素画在框内） ----------
type BoundaryData = { label: string; elementType: string; expanded: boolean };
type BoundaryNodeType = Node<BoundaryData, 'boundary'>;

function BoundaryNode({ data, id }: NodeProps<BoundaryNodeType>) {
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  return (
    <div className={`c4-boundary ${cls}`}>
      <div className="c4-boundary-header">
        <span className="c4-boundary-name">{data?.label || id}</span>
        <button className="c4-toggle" onClick={(e) => { e.stopPropagation(); expandHandler && expandHandler(Number(id)); }}>
          {data?.expanded ? '▾ 收起' : '▸ 展开'}
        </button>
      </div>
      <div className="c4-boundary-body" />
    </div>
  );
}

const nodeTypes = { c4: C4Node, boundary: BoundaryNode };

interface BuildOpts {
  hasChildren: (id: number) => boolean;
  expanded: Set<number>;
  contextIds: Set<number>;
}

// 自下而上递归计算每个元素的「边界框尺寸」（叶子=基础尺寸；展开的父级=包住其子元素的尺寸）
function computeExtent(e: Element, byParent: Map<number, Element[]>, expanded: Set<number>, memo: Map<number, { w: number; h: number }>): { w: number; h: number } {
  if (memo.has(e.id)) return memo.get(e.id)!;
  const kids = expanded.has(e.id) ? byParent.get(e.id) || [] : [];
  if (!kids.length) {
    const r = { w: NODE_W, h: NODE_H };
    memo.set(e.id, r);
    return r;
  }
  let maxW = 0, maxH = 0;
  kids.forEach((c) => {
    const ce = computeExtent(c, byParent, expanded, memo);
    const rx = c.posX - e.posX;
    const ry = c.posY - e.posY;
    maxW = Math.max(maxW, rx + ce.w);
    maxH = Math.max(maxH, ry + ce.h);
  });
  const r = { w: maxW + PAD * 2, h: maxH + PAD * 2 };
  memo.set(e.id, r);
  return r;
}

function buildNodes(elements: Element[], o: BuildOpts): Node[] {
  const byParent = new Map<number, Element[]>();
  elements.forEach((e) => { const a = byParent.get(e.parentId ?? -1) || []; a.push(e); byParent.set(e.parentId ?? -1, a); });

  const memo = new Map<number, { w: number; h: number }>();
  elements.forEach((e) => computeExtent(e, byParent, o.expanded, memo));

  const nodes: any[] = [];
  elements.forEach((e) => {
    const kids = o.expanded.has(e.id) ? byParent.get(e.id) || [] : [];
    if (kids.length) {
      const ext = memo.get(e.id)!;
      nodes.push({
        id: String(e.id),
        type: 'boundary',
        position: { x: e.posX, y: e.posY },
        style: { width: ext.w, height: ext.h },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: { label: e.name, elementType: e.type, expanded: o.expanded.has(e.id) } as BoundaryData,
      });
    } else {
      nodes.push({
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
        } as C4NodeData,
      });
    }
  });
  return nodes;
}

type Props = {
  elements: Element[];
  relationships: Relationship[];
  contextIds?: Set<number>;
  selectedId?: string | null;
  hasChildren: (id: number) => boolean;
  onToggleExpand: (id: number) => void;
  onSelect: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onAddEdge: (sourceId: number, targetId: number) => void;
  onMoveElement: (id: number, x: number, y: number) => void;
  onMoveElementCommit: (id: number, x: number, y: number) => void;
  addTypes: string[];
  onAddType: (t: string) => void;
  onAddChild: (id: number) => void;
  onDelete: (id: number) => void;
};

export default function C4Canvas({
  elements,
  relationships,
  contextIds = new Set(),
  selectedId = null,
  hasChildren,
  onToggleExpand,
  onSelect,
  onSelectEdge,
  onAddEdge,
  onMoveElement,
  onMoveElementCommit,
  addTypes,
  onAddType,
  onAddChild,
  onDelete,
}: Props) {
  addChildHandler = onAddChild;
  expandHandler = onToggleExpand;
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);

  const nodes = useMemo<Node[]>(() => buildNodes(elements, { hasChildren, expanded: contextIds, contextIds }), [elements, hasChildren, contextIds]);

  const visible = useMemo(() => new Set(elements.map((e) => String(e.id))), [elements]);
  const edges = useMemo<Edge[]>(
    () =>
      relationships
        .filter((r) => visible.has(String(r.sourceId)) && visible.has(String(r.targetId)))
        .map((r) => {
          const base = r.interaction || r.label || 'uses';
          const label = r.protocol ? `${base} · ${r.protocol}` : base;
          const linked = selectedId != null && (String(r.sourceId) === selectedId || String(r.targetId) === selectedId);
          return {
            id: String(r.id),
            source: String(r.sourceId),
            target: String(r.targetId),
            label,
            type: 'smoothstep',
            animated: linked,
            style: linked ? { stroke: '#2563eb', strokeWidth: 2.5 } : undefined,
            labelStyle: linked ? { fill: '#2563eb', fontWeight: 600 } : undefined,
          };
        }),
    [relationships, visible, selectedId],
  );

  const [nodeState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgeState, setEdges, onEdgesChange] = useEdgesState(edges);
  useEffect(() => setNodes(nodes), [nodes, setNodes]);
  useEffect(() => setEdges(edges), [edges, setEdges]);

  const onConnect = useCallback((c: Connection) => { if (c.source && c.target) onAddEdge(Number(c.source), Number(c.target)); }, [onAddEdge]);

  const onPaneCtx = useCallback((e: any) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, nodeId: null }); }, []);
  const onNodeCtx = useCallback((e: any, node: Node) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }); }, []);

  const onDragStop = useCallback((_e: unknown, node: Node) => {
    onMoveElement(Number(node.id), node.position.x, node.position.y);
    onMoveElementCommit(Number(node.id), node.position.x, node.position.y);
  }, [onMoveElement, onMoveElementCommit]);

  return (
    <ReactFlow
      nodes={nodeState}
      edges={edgeState}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeClick={(_e, edge) => { onSelect(null); onSelectEdge(edge.id); }}
      onNodeClick={(_e, node) => { onSelect(node.id); onSelectEdge(null); }}
      onPaneClick={() => { onSelect(null); onSelectEdge(null); }}
      onNodeContextMenu={onNodeCtx}
      onPaneContextMenu={onPaneCtx}
      onNodeDragStop={onDragStop}
      nodeTypes={nodeTypes}
      fitView
      style={{ height: '100%' }}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
      {menu && (
        <div
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 1200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', minWidth: 180, padding: 6 }}
          onClick={() => setMenu(null)}
        >
          {menu.nodeId ? (
            <div>
              <div className="menu-item" onClick={() => { if (hasChildren(Number(menu.nodeId))) { onToggleExpand(Number(menu.nodeId)); setMenu(null); } }}>展开 / 收起</div>
              <div className="menu-item" onClick={() => { if (menu.nodeId) onAddChild(Number(menu.nodeId)); setMenu(null); }}>添加子元素</div>
              <div className="menu-item" onClick={() => { if (menu.nodeId) onDelete(Number(menu.nodeId)); setMenu(null); }}>删除元素</div>
            </div>
          ) : (
            addTypes.map((t) => (
              <div key={t} className="menu-item" onClick={() => { onAddType(t); setMenu(null); }}>+ 添加 {kindLabel[t] || t}</div>
            ))
          )}
        </div>
      )}
    </ReactFlow>
  );
}
