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

type C4NodeData = {
  label: string;
  description: string;
  elementType: string;
  context: boolean;
  isParent: boolean;
  canExpand: boolean;
  expanded: boolean;
  canAdd: boolean;
};

type C4NodeType = Node<C4NodeData, 'c4'>;

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

let toggleHandler: ((id: number) => void) | null = null;
let addChildHandler: ((id: number) => void) | null = null;

function C4Node({ data, id }: NodeProps<C4NodeType>) {
  const kind = data?.elementType ? kindLabel[data.elementType] || data.elementType : '';
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  const label = data?.label || `#${id}`;
  return (
    <div className={`c4-node ${cls} ${data?.context ? 'c4-context' : ''} ${data?.isParent ? 'c4-parent' : ''}`}>
      <div className="kind">{kind}</div>
      <div className="name">{label}</div>
      {data?.description ? <div className="desc">{data.description}</div> : null}
      <div className="c4-actions">
        {data?.canExpand && (
          <button className="c4-toggle" onClick={(e) => { e.stopPropagation(); toggleHandler && toggleHandler(Number(id)); }}>
            {data.expanded ? '▾ 收起' : '▸ 展开'}
          </button>
        )}
        {data?.canAdd && (
          <button className="c4-drill" onClick={(e) => { e.stopPropagation(); addChildHandler && addChildHandler(Number(id)); }}>
            + 添加子元素
          </button>
        )}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { c4: C4Node };

interface BuildOpts {
  hasChildren: (id: number) => boolean;
  expanded: Set<number>;
  contextIds: Set<number>;
}

const NODE_W = 200;
const NODE_H = 100;
const BOX_PAD = 60;
const BOX_MIN_W = 340;
const BOX_MIN_H = 240;

// 稳定版包含：父元素以自身坐标为框左上角（不跳位），子元素以相对坐标画在框内，父框按子元素范围自适应
function buildNodes(elements: Element[], o: BuildOpts): Node[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const boxSize: Record<number, { w: number; h: number }> = {};
  elements.forEach((e) => {
    const p = e.parentId;
    if (p != null && byId.has(p)) {
      const parent = byId.get(p)!;
      const rx = e.posX - parent.posX;
      const ry = e.posY - parent.posY;
      const b = boxSize[p] || (boxSize[p] = { w: 0, h: 0 });
      b.w = Math.max(b.w, rx + NODE_W);
      b.h = Math.max(b.h, ry + NODE_H);
    }
  });
  return elements.map((e) => {
    const isParent = !!boxSize[e.id];
    const node: any = {
      id: String(e.id),
      type: 'c4',
      position: { x: e.posX, y: e.posY },
      data: {
        label: e.name,
        description: e.description,
        elementType: e.type,
        context: o.contextIds.has(e.id),
        isParent,
        canExpand: o.hasChildren(e.id),
        expanded: o.expanded.has(e.id),
        canAdd: (e.type === 'softwareSystem' || e.type === 'container') && !o.hasChildren(e.id),
      },
    };
    const p = e.parentId;
    if (p != null && byId.has(p)) {
      const parent = byId.get(p)!;
      node.parentId = String(p);
      node.position = { x: e.posX - parent.posX, y: e.posY - parent.posY };
      node.extent = 'parent';
    }
    const box = boxSize[e.id];
    if (box) {
      node.style = {
        width: Math.max(BOX_MIN_W, box.w + BOX_PAD * 2),
        height: Math.max(BOX_MIN_H, box.h + BOX_PAD * 2),
      };
    }
    return node as Node;
  });
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
  toggleHandler = onToggleExpand;
  addChildHandler = onAddChild;

  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);

  const nodes = useMemo<Node[]>(() => buildNodes(elements, { hasChildren, expanded: contextIds, contextIds }), [elements, hasChildren, contextIds]);

  const visible = useMemo(() => new Set(elements.map((e) => String(e.id))), [elements]);
  // 选中节点时，高亮与之相连的连接线
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

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) onAddEdge(Number(c.source), Number(c.target));
    },
    [onAddEdge],
  );

  const onPaneCtx = useCallback((e: any) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, nodeId: null });
  }, []);
  const onNodeCtx = useCallback((e: any, node: Node) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  const onDragStop = useCallback(
    (_e: unknown, node: Node) => {
      onMoveElement(Number(node.id), node.position.x, node.position.y);
      onMoveElementCommit(Number(node.id), node.position.x, node.position.y);
    },
    [onMoveElement, onMoveElementCommit],
  );

  return (
    <ReactFlow
      nodes={nodeState}
      edges={edgeState}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeClick={(_e, edge) => {
        onSelect(null);
        onSelectEdge(edge.id);
      }}
      onNodeClick={(_e, node) => {
        onSelect(node.id);
        onSelectEdge(null);
      }}
      onPaneClick={() => {
        onSelect(null);
        onSelectEdge(null);
      }}
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
          style={{
            position: 'absolute', left: menu.x, top: menu.y, zIndex: 1200,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: 'var(--shadow)', minWidth: 180, padding: 6,
          }}
          onClick={() => setMenu(null)}
        >
          {menu.nodeId ? (
            <div>
              <div className="menu-item" onClick={() => { if (hasChildren(Number(menu.nodeId))) { onToggleExpand(Number(menu.nodeId)); setMenu(null); } }}>
                展开 / 收起
              </div>
              <div className="menu-item" onClick={() => { if (menu.nodeId) onAddChild(Number(menu.nodeId)); setMenu(null); }}>添加子元素</div>
              <div className="menu-item" onClick={() => { if (menu.nodeId) onDelete(Number(menu.nodeId)); setMenu(null); }}>删除元素</div>
            </div>
          ) : (
            addTypes.map((t) => (
              <div key={t} className="menu-item" onClick={() => { onAddType(t); setMenu(null); }}>
                + 添加 {kindLabel[t] || t}
              </div>
            ))
          )}
        </div>
      )}
    </ReactFlow>
  );
}
