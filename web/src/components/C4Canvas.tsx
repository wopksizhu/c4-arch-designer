import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
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
  onDrill: (id: number) => void;
};

type C4NodeType = Node<C4NodeData, 'c4'>;

const kindLabel: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};

function C4Node({ data, id }: NodeProps<C4NodeType>) {
  return (
    <div className={`c4-node c4-${data.elementType}`}>
      <div className="kind">{kindLabel[data.elementType] || data.elementType}</div>
      <div className="name">{data.label}</div>
      {data.description ? <div className="desc">{data.description}</div> : null}
      {data.drillable && (
        <button
          className="c4-drill"
          onClick={(e) => {
            e.stopPropagation();
            data.onDrill(Number(id));
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

type Props = {
  elements: Element[];
  relationships: Relationship[];
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
  drillable,
  onDrill,
  onSelect,
  onSelectEdge,
  onAddEdge,
  onMoveElement,
  onMoveElementCommit,
}: Props) {
  const nodes = useMemo<Node[]>(
    () =>
      elements.map((e) => ({
        id: String(e.id),
        type: 'c4',
        position: { x: e.posX, y: e.posY },
        data: {
          label: e.name,
          description: e.description,
          elementType: e.type,
          drillable: drillable(e),
          onDrill,
        } as C4NodeData,
      })),
    [elements, drillable, onDrill],
  );

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

  // 完全受控：位置变更直接同步给父级（元素即数据源），保证画布永远和模型一致
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          onMoveElement(Number(c.id), c.position.x, c.position.y);
        }
      }
    },
    [onMoveElement],
  );
  const onEdgesChange = useCallback(() => {}, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) onAddEdge(Number(c.source), Number(c.target));
    },
    [onAddEdge],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
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
      onNodeDragStop={(_e, node) => onMoveElementCommit(Number(node.id), node.position.x, node.position.y)}
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
