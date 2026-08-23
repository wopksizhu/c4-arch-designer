import type { Element } from '../types';

const KIND: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'System',
  container: 'Container',
  component: 'Component',
};

type Props = {
  elements: Element[];
  drilledId: number | null;
  onSelect: (id: number) => void;
  onDrill: (id: number) => void;
  onReparent: (childId: number, newParentId: number | null) => void;
};

function node({ e, depth, elements, onSelect, onDrill, onReparent, drilledId }: {
  e: Element; depth: number; elements: Element[]; onSelect: (id: number) => void; onDrill: (id: number) => void; onReparent: (childId: number, newParentId: number | null) => void; drilledId: number | null;
}) {
  const kids = elements.filter((x) => x.parentId === e.id);
  const drillable = e.type === 'softwareSystem' || e.type === 'container';
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
        <span style={{ fontWeight: drilledId === e.id ? 700 : 500 }}>{e.name}</span>
        <span className="faint" style={{ fontSize: 11, marginLeft: 6 }}>{KIND[e.type] || e.type}</span>
        {drillable && (
          <button
            className="sm"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            onClick={(ev) => { ev.stopPropagation(); onDrill(e.id); }}
          >
            进入
          </button>
        )}
      </div>
      {kids.map((c) => node({ e: c, depth: depth + 1, elements, onSelect, onDrill, onReparent, drilledId }))}
    </div>
  );
}

export default function ElementTree({ elements, drilledId, onSelect, onDrill, onReparent }: Props) {
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
      {roots.map((e) => node({ e, depth: 0, elements, onSelect, onDrill, onReparent, drilledId }))}
    </div>
  );
}

