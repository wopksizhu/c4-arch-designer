import { useState } from 'react';

// 可选可输入的组合框：输入自动过滤预设，点选项填充，也允许自定义值
export default function ComboInput({
  value,
  options,
  onChange,
  placeholder,
  width = '100%',
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => (o || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ position: 'relative', width }}>
      <input
        value={value}
        placeholder={placeholder}
        style={{ paddingRight: 28 }}
        onFocus={() => {
          setOpen(true);
          setQ(value);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: 10 }}>▾</span>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow)',
            maxHeight: 200,
            overflow: 'auto',
            zIndex: 40,
          }}
        >
          {filtered.length ? (
            filtered.map((o) => (
              <div key={o} className="menu-item" onMouseDown={() => { onChange(o); setOpen(false); }}>
                {o}
              </div>
            ))
          ) : (
            <div className="muted" style={{ padding: '8px 12px', fontSize: 12 }}>无匹配项</div>
          )}
        </div>
      )}
    </div>
  );
}
