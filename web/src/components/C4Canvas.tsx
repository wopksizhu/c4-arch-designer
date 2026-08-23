import { useCallback, useEffect, useMemo } from 'react';
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
  drillable: boolean;
  context: boolean;
  isParent: boolean;
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

// 模块级 drill 回调（避免把函数塞进 React Flow 的 node.data，那会导致 data 被序列化/克隆失败而变空）
let drillHandler: ((id: number) => void) | null = null;

function C4Node({ data, id }: NodeProps<C4NodeType>) {
  const kind = data?.elementType ? kindLabel[data.elementType] || data.elementType : '';
  const cls = data?.elementType ? c4Cls[data.elementType] || '' : '';
  const label = data?.label || `#${id}`;
  return (
    <div className={`c4-node ${cls} ${data?.context ? 'c4-context' : ''} ${data?.isParent ? 'c4-parent' : ''}`}>
      <div className="kind">{kind}</div>
      <div className="name">{label}</div>
      {data?.description ? <div className="desc">{data.description}</div> : null}
      {data?.drillable && (
        <button
          className="c4-drill"
          onClick={(e) => {
            e.stopPropagation();
            drillHandler && drillHandler(Number(id));
          }}
        >
          进入
        </button>
      )}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { c4: C4Node };

const NODE_W = 200;
const NODE_H = 100;

// 构建 compound 节点：父元素作为「边界框」，子元素（parentId 指向它）绘制在框内
function buildNodes(elements: Element[], drillable: (e: Element) => boolean, contextIds: Set<number>): Node[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const box: Record<number, { minX: number; minY: number; maxX: number; maxY: number }> = {};
  elements.forEach((e) => {
    const p = e.parentId;
    if (p != null && byId.has(p)) {
      const b = box[p] || (box[p] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      b.minX = Math.min(b.minX, e.posX);
      b.minY = Math.min(b.minY, e.posY);
      b.maxX = Math.max(b.maxX, e.posX + NODE_W);
      b.maxY = Math.max(b.maxY, e.posY + NODE_H);
    }
  });
  return elements.map((e) => {
    const node: any = {
      id: String(e.id),
      type: 'c4',
      position: { x: e.posX, y: e.posY },
      data: {
        label: e.name,
        description: e.description,
        elementType: e.type,
        drillable: drillable(e),
        context: contextIds.has(e.id),
        isParent: !!box[e.id],
      },
    };
    const p = e.parentId;
    if (p != null && byId.has(p)) {
      const parent = byId.get(p)!;
      node.parentId = String(p);
      node.position = { x: e.posX - parent.posX, y: e.posY - parent.posY };
      node.extent = 'parent';
    }
    const b = box[e.id];
    if (b) {
      node.style = { width: b.maxX - b.minX + 80, height: b.maxY - b.minY + 70 };
    }
    return node as Node;
  });
}

type Props = {
  elements: Element[];
  relationships: Relationship[];
  contextIds?: Set<number>;
  drillable: (e: Element) => boolean;
  onDrill: (id: number) => void;
  onSelect: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onAddEdge: (sourceId: number, targetId: number) => void;
  onMoveElement: (id: number, x: number, y: number) => void;
  onMoveElementCommit: (id: number, x: number, y: number) => void;
};

export default function C4Canvas({
  elements,
  relationships,
  contextIds = new Set(),
  drillable,
  onDrill,
  onSelect,
  onSelectEdge,
  onAddEdge,
  onMoveElement,
  onMoveElementCommit,
}: Props) {
  // 记录当前 drill 回调，供节点上的「进入」按钮使用
  drillHandler = onDrill;

  const nodes = useMemo<Node[]>(() => buildNodes(elements, drillable, contextIds), [elements, drillable, contextIds]);

  const visible = useMemo(() => new Set(elements.map((e) => String(e.id))), [elements]);
  const edges = useMemo<Edge[]>(
    () =>
      relationships
        .filter((r) => visible.has(String(r.sourceId)) && visible.has(String(r.targetId)))
        .map((r) => {
          const base = r.interaction || r.label || 'uses';
          const label = r.protocol ? `${base} · ${r.protocol}` : base;
          return {
            id: String(r.id),
            source: String(r.sourceId),
            target: String(r.targetId),
            label,
            type: 'smoothstep',
          };
        }),
    [relationships, visible],
  );

  // 用 useNodesState 管理实时拖拽；数据变化时从 props 同步
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

  // 拖拽结束：用绝对坐标回写（嵌套节点 position 是相对的，positionAbsolute 才是绝对）
  const onDragStop = useCallback(
    (_e: unknown, node: Node) => {
      const abs = (node as any).positionAbsolute;
      const x = abs?.x ?? node.position.x;
      const y = abs?.y ?? node.position.y;
      onMoveElement(Number(node.id), x, y);
      onMoveElementCommit(Number(node.id), x, y);
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
      onNodeDragStop={onDragStop}
      nodeTypes={nodeTypes}
      fitView
      style={{ height: '100%' }}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
