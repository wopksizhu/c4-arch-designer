import type { Element } from '../types';

const KIND: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'System',
  container: 'Container',
  component: 'Component',
};

type Props = {
  elements: Element[];
  expanded: Set<number>;
  onSelect: (id: number) => void;
  onExpand: (id: number) => void;
  onReparent: (childId: number, newParentId: number | null) => void;
};

function node({ e, depth, elements, onSelect, onExpand, onReparent, expanded }: {
  e: Element; depth: number; elements: Element[]; onSelect: (id: number) => void; onExpand: (id: number) => void; onReparent: (childId: number, newParentId: number | null) => void; expanded: Set<number>;
}) {
  const kids = elements.filter((x) => x.parentId === e.id);
  const canExpand = e.type === 'softwareSystem' || e.type === 'container';
  return (
    <div key={e.id}>
      <div
        className="tree-row"
        style={{ paddingLeft: depth * 14, cursor: 'grab' }}
        draggable
        onDragStart={(ev) => ev.dataTransfer.setData('text/element-id', String(e.id))}
        onDragOver={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
        onDrop={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const child = Number(ev.dataTransfer.getData('text/element-id'));
          if (child && child !== e.id) onReparent(child, e.id);
        }}
        onClick={() => onSelect(e.id)}
        title={e.name}
      >
        <span className={`dot c4-${e.type}`} />
        <span style={{ fontWeight: expanded.has(e.id) ? 700 : 500 }}>{e.name}</span>
        <span className="faint" style={{ fontSize: 11, marginLeft: 6 }}>{KIND[e.type] || e.type}</span>
        {canExpand && (
          <button
            className="sm"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            onClick={(ev) => { ev.stopPropagation(); onExpand(e.id); }}
          >
            {expanded.has(e.id) ? '▾ 收起' : '▸ 展开'}
          </button>
        )}
      </div>
      {expanded.has(e.id) && kids.map((c) => node({ e: c, depth: depth + 1, elements, onSelect, onExpand, onReparent, expanded }))}
    </div>
  );
}

export default function ElementTree({ elements, expanded, onSelect, onExpand, onReparent }: Props) {
  const roots = elements.filter((e) => (e.parentId ?? null) === null);
  return (
    <div className="tree">
      <div className="nav-title">元素结构（拖到目标上可调整层级）</div>
      <div
        className="tree-row"
        style={{ color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          const child = Number(ev.dataTransfer.getData('text/element-id'));
          if (child) onReparent(child, null);
        }}
      >
        拖到「根」= 设为顶层元素
      </div>
      {roots.length === 0 && <div className="faint" style={{ padding: '10px 12px', fontSize: 12 }}>暂无元素。</div>}
      {roots.map((e) => node({ e, depth: 0, elements, onSelect, onExpand, onReparent, expanded }))}
    </div>
  );
}


