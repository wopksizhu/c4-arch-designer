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
};

function node({ e, depth, elements, onSelect, onDrill, drilledId }: { e: Element; depth: number; elements: Element[]; onSelect: (id: number) => void; onDrill: (id: number) => void; drilledId: number | null }) {
  const kids = elements.filter((x) => x.parentId === e.id);
  const drillable = e.type === 'softwareSystem' || e.type === 'container';
  return (
    <div key={e.id}>
      <div
        className="tree-row"
        style={{ paddingLeft: depth * 14, cursor: 'pointer' }}
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
      {kids.map((c) => node({ e: c, depth: depth + 1, elements, onSelect, onDrill, drilledId }))}
    </div>
  );
}

export default function ElementTree({ elements, drilledId, onSelect, onDrill }: Props) {
  const roots = elements.filter((e) => (e.parentId ?? null) === null);
  return (
    <div className="tree">
      <div className="nav-title">元素结构</div>
      {roots.length === 0 && <div className="faint" style={{ padding: '10px 12px', fontSize: 12 }}>暂无元素。</div>}
      {roots.map((e) => node({ e, depth: 0, elements, onSelect, onDrill, drilledId }))}
    </div>
  );
}
