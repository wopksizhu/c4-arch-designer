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
};

type C4NodeType = Node<C4NodeData, 'c4'>;

const kindLabel: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};

function C4Node({ data }: NodeProps<C4NodeType>) {
  return (
    <div className={`c4-node c4-${data.elementType}`}>
      <div className="kind">{kindLabel[data.elementType] || data.elementType}</div>
      <div className="name">{data.label}</div>
      {data.description ? <div className="desc">{data.description}</div> : null}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { c4: C4Node };

type Props = {
  elements: Element[];
  relationships: Relationship[];
  onSelect: (id: string | null) => void;
  onAddEdge: (sourceId: number, targetId: number) => void;
  onMoveElement: (id: number, x: number, y: number) => void;
};

export default function C4Canvas({
  elements,
  relationships,
  onSelect,
  onAddEdge,
  onMoveElement,
}: Props) {
  const nodes = useMemo<Node[]>(
    () =>
      elements.map((e) => ({
        id: String(e.id),
        type: 'c4',
        position: { x: e.posX, y: e.posY },
        data: { label: e.name, description: e.description, elementType: e.type } as C4NodeData,
      })),
    [elements],
  );

  const visible = useMemo(() => new Set(elements.map((e) => String(e.id))), [elements]);
  const edges = useMemo<Edge[]>(
    () =>
      relationships
        .filter((r) => visible.has(String(r.sourceId)) && visible.has(String(r.targetId)))
        .map((r) => ({
          id: String(r.id),
          source: String(r.sourceId),
          target: String(r.targetId),
          label: r.label || 'uses',
          type: 'smoothstep',
        })),
    [relationships, visible],
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

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => onMoveElement(Number(node.id), node.position.x, node.position.y),
    [onMoveElement],
  );

  return (
    <ReactFlow
      nodes={nodeState}
      edges={edgeState}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_e, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={onNodeDragStop}
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
