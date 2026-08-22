import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import C4Canvas from '../components/C4Canvas';
import type {
  AiDraft,
  Element,
  ElementType,
  ImpactResult,
  Project,
  Prototype,
  Relationship,
  Requirement,
  TraceLink,
  TraceMatrixRow,
} from '../types';

const LEVEL_NAME: Record<number, string> = { 1: 'Context', 2: 'Container', 3: 'Component' };
const TYPES: Record<number, string[]> = {
  1: ['person', 'softwareSystem'],
  2: ['container'],
  3: ['component'],
};
const TYPE_LABEL: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};

export default function ModelPage() {
  const { id } = useParams();
  const pid = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [traceLinks, setTraceLinks] = useState<TraceLink[]>([]);
  const [drilledId, setDrilledId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('req');
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    try {
      const [p, es, rs, qs, ps, ts] = await Promise.all([
        api.listProjects().then((ps) => ps.find((x) => x.id === pid) || null),
        api.listElements(pid),
        api.listRelationships(pid),
        api.listRequirements(pid),
        api.listPrototypes(pid),
        api.listTraceLinks(pid),
      ]);
      setProject(p);
      setElements(es);
      setRelationships(rs);
      setRequirements(qs);
      setPrototypes(ps);
      setTraceLinks(ts);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [pid]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 钻取式 C4：breadcrumb 从当前钻取元素沿 parentId 上行到根
  const breadcrumb = useMemo(() => {
    let cur = drilledId;
    const chain: { id: number; name: string; type: string }[] = [];
    const byId = new Map(elements.map((e) => [e.id, e]));
    while (cur !== null) {
      const e = byId.get(cur);
      if (!e) break;
      chain.unshift({ id: e.id, name: e.name, type: e.type });
      cur = e.parentId;
    }
    return chain;
  }, [drilledId, elements]);

  // 当前视图层级：drillId 为 null = Context(1)；否则 = 钻取元素层级 + 1
  const drilledElement = drilledId !== null ? elements.find((e) => e.id === drilledId) || null : null;
  const viewLevel = drilledElement ? drilledElement.level + 1 : 1;

  const visibleElements = useMemo(() => {
    if (drilledId === null) return elements.filter((e) => e.parentId === null);
    return elements.filter((e) => e.parentId === drilledId);
  }, [elements, drilledId]);

  const visibleIds = useMemo(() => new Set(visibleElements.map((e) => e.id)), [visibleElements]);
  const visibleRelationships = useMemo(
    () => relationships.filter((r) => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId)),
    [relationships, visibleIds],
  );

  const drillable = (e: Element) => e.type === 'softwareSystem' || e.type === 'container';

  async function addElement(type: string) {
    const e = await api.createElement(pid, {
      level: viewLevel,
      type: type as ElementType,
      name: 'New ' + TYPE_LABEL[type],
      parentId: drilledId,
      posX: 200 + elements.length * 20,
      posY: 200 + elements.length * 20,
    });
    setElements((prev) => [...prev, e]);
  }

  async function addEdge(sourceId: number, targetId: number) {
    const r = await api.createRelationship(pid, {
      sourceId,
      targetId,
      label: 'uses',
      level: viewLevel,
    });
    setRelationships((prev) => [...prev, r]);
  }

  async function moveElement(id: number, x: number, y: number) {
    const e = elements.find((x) => x.id === id);
    if (!e) return;
    const updated = { ...e, posX: x, posY: y };
    setElements((prev) => prev.map((it) => (it.id === id ? updated : it)));
    await api.updateElement(id, { posX: x, posY: y });
  }

  const selectedElement = elements.find((e) => String(e.id) === selectedId) || null;
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedEdge = relationships.find((r) => String(r.id) === selectedEdgeId) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="row" style={{ padding: 10, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <Link to="/" className="muted" style={{ textDecoration: 'none' }}>
          ← 返回
        </Link>
        <strong>{project?.name || '…'}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{project?.description}</span>
        <div className="grow" />
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button
            className={drilledId === null ? 'active' : ''}
            onClick={() => setDrilledId(null)}
          >
            Context
          </button>
          {breadcrumb.map((c) => (
            <button
              key={c.id}
              className={drilledId === c.id ? 'active' : ''}
              onClick={() => setDrilledId(c.id)}
            >
              {c.name}
            </button>
          ))}
          {drilledElement && (
            <span className="muted" style={{ fontSize: 12 }}>
              ← 点击上面可返回外层
            </span>
          )}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>当前层级：{LEVEL_NAME[viewLevel]}</span>
        <span style={{ width: 8 }} />
        {TYPES[viewLevel].map((t) => (
          <button key={t} className="primary" onClick={() => addElement(t)}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1 }}>
          <C4Canvas
            elements={visibleElements}
            relationships={visibleRelationships}
            onSelect={setSelectedId}
            onSelectEdge={setSelectedEdgeId}
            onAddEdge={addEdge}
            onMoveElement={moveElement}
          />
        </div>
        <aside style={{ width: 320, borderLeft: '1px solid #e5e7eb', background: '#fff', overflow: 'auto' }}>
          {selectedEdge ? (
            <EdgeInspector
              edge={selectedEdge}
              elements={elements}
              onSave={async (e) => {
                const updated = await api.updateRelationship(e.id, { ...e });
                setRelationships((prev) => prev.map((it) => (it.id === e.id ? { ...it, ...e, id: it.id } : it)));
                setSelectedEdgeId(String(updated && updated.id ? updated.id : e.id));
              }}
              onDelete={async (eid) => { await api.deleteRelationship(eid); setSelectedEdgeId(null); reload(); }}
            />
          ) : (
            <Inspector
              element={selectedElement}
              canDrill={!!selectedElement && drillable(selectedElement)}
              onDrill={() => selectedElement && setDrilledId(selectedElement.id)}
              onAiDesign={async () => {
                if (!selectedElement) return;
                try {
                  const r = await api.aiDesign(pid, { name: selectedElement.name, type: selectedElement.type, description: selectedElement.description });
                  if (r.draft && r.draft.elements?.length) {
                    const res = await api.aiApply(pid, r.draft);
                    // eslint-disable-next-line no-alert
                    alert(`AI 已生成该块的详细结构：${res.elements} 个元素、${res.relationships} 条关系`);
                    reload();
                  } else {
                    // eslint-disable-next-line no-alert
                    alert('AI 未识别出结构，请重试或检查 AI 配置');
                  }
                } catch (err: any) {
                  // eslint-disable-next-line no-alert
                  alert((err as Error).message || 'AI 设计失败');
                }
              }}
              onSave={async (e) => {
                const updated = await api.updateElement(e.id, { ...e });
                const id = updated && updated.id ? updated.id : e.id;
                setSelectedId(String(id));
                setElements((prev) => prev.map((it) => (it.id === e.id ? { ...it, ...e, id: it.id } : it)));
              }}
              onDelete={async (eid) => { await api.deleteElement(eid); setSelectedId(null); reload(); }}
            />
          )}
        </aside>
      </div>

      <div className="tabs" style={{ height: 360, borderTop: '1px solid #e5e7eb', background: '#fff' }}>
        <div className="tablist">
          {[
            ['req', '需求'],
            ['proto', '原型'],
            ['matrix', '追溯矩阵'],
            ['impact', '影响分析'],
            ['ai', 'AI 与导出'],
          ].map(([k, label]) => (
            <button key={k} className={activeTab === k ? 'active' : ''} onClick={() => setActiveTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tabcontent">
          {err && <div className="muted" style={{ color: '#dc2626', marginBottom: 8 }}>{err}</div>}
          {activeTab === 'req' && (
            <RequirementsTab
              pid={pid}
              requirements={requirements}
              elements={elements.filter((e) => e.level === 2)}
              traceLinks={traceLinks}
              onChanged={reload}
            />
          )}
          {activeTab === 'proto' && (
            <PrototypesTab
              pid={pid}
              prototypes={prototypes}
              containerElements={elements.filter((e) => e.level === 2)}
              traceLinks={traceLinks}
              onChanged={reload}
            />
          )}
          {activeTab === 'matrix' && <MatrixTab pid={pid} />}
          {activeTab === 'impact' && <ImpactTab pid={pid} elements={elements} requirements={requirements} />}
          {activeTab === 'ai' && <AiTab pid={pid} elements={visibleElements} relationships={visibleRelationships} onApply={reload} />}
        </div>
      </div>
    </div>
  );
}

// ---- Inspector ----
function Inspector({ element, canDrill, onDrill, onAiDesign, onSave, onDelete }: { element: Element | null; canDrill: boolean; onDrill: () => void; onAiDesign: () => void; onSave: (e: Element) => void; onDelete: (id: number) => void }) {
  const [form, setForm] = useState<Element | null>(null);
  useEffect(() => setForm(element), [element]);
  if (!element || !form)
    return (
      <div style={{ padding: 20 }} className="muted">
        选中元素后可编辑属性。在画布上点击一个元素。
      </div>
    );
  const set = (k: keyof Element, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <div style={{ padding: 16 }}>
      <label>类型</label>
      <select value={form.type} onChange={(e) => set('type', e.target.value)}>
        {Object.entries(TYPE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <label>名称</label>
      <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      <label>描述</label>
      <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
      <label>技术栈</label>
      <input value={form.technology} onChange={(e) => set('technology', e.target.value)} />
      <label>标签</label>
      <input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
      <label>层级</label>
      <select value={form.level} onChange={(e) => set('level', Number(e.target.value))}>
        <option value={1}>Context</option>
        <option value={2}>Container</option>
        <option value={3}>Component</option>
      </select>
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
        {canDrill && (
          <button className="primary" onClick={onDrill}>
            进入内部设计
          </button>
        )}
        <button onClick={onAiDesign}>AI 生成该块详细结构</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => onSave(form)}>保存</button>
        <button className="danger" onClick={() => onDelete(form.id)}>删除</button>
      </div>
    </div>
  );
}

// ---- 连线（关系）检查器 ----
function EdgeInspector({ edge, elements, onSave, onDelete }: { edge: Relationship; elements: Element[]; onSave: (e: Relationship) => void; onDelete: (id: number) => void }) {
  const [form, setForm] = useState<Relationship | null>(null);
  useEffect(() => setForm(edge), [edge]);
  if (!form)
    return <div style={{ padding: 20 }} className="muted">选中连接线后可编辑交互信息。</div>;
  const set = (k: keyof Relationship, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const nameOf = (id: number) => elements.find((e) => e.id === id)?.name || `#${id}`;
  return (
    <div style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {nameOf(form.sourceId)} → {nameOf(form.targetId)}
      </div>
      <label>交互内容</label>
      <input value={form.interaction} placeholder="如：下单、查询、发事件" onChange={(e) => set('interaction', e.target.value)} />
      <label>通信协议</label>
      <input value={form.protocol} placeholder="如：REST/HTTP、gRPC、MQ" onChange={(e) => set('protocol', e.target.value)} />
      <label>补充说明</label>
      <textarea rows={2} value={form.description} placeholder="可选" onChange={(e) => set('description', e.target.value)} />
      <label>标签</label>
      <input value={form.label} onChange={(e) => set('label', e.target.value)} />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => onSave(form)}>保存</button>
        <button className="danger" onClick={() => onDelete(form.id)}>删除</button>
      </div>
    </div>
  );
}

// ---- 需求 ----
function RequirementsTab({ pid, requirements, elements, traceLinks, onChanged }: { pid: number; requirements: Requirement[]; elements: Element[]; traceLinks: TraceLink[]; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [prio, setPrio] = useState('medium');
  const [showImport, setShowImport] = useState(false);
  const [md, setMd] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [csv, setCsv] = useState('');

  async function add() {
    if (!title.trim()) return;
    try {
      await api.createRequirement(pid, { code, title, description: desc, priority: prio });
      setTitle('');
      setDesc('');
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '添加失败');
    }
  }

  async function importMd() {
    if (!md.trim()) return;
    try {
      const r = await api.importRequirements(pid, md);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      setMd('');
      setShowImport(false);
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '导入失败');
    }
  }

  async function importCsv() {
    if (!csv.trim()) return;
    try {
      const r = await api.importRequirementsCsv(pid, csv);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      setCsv('');
      setShowCsv(false);
      onChanged();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '导入失败');
    }
  }

  async function importXlsx(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await api.importRequirementsExcel(pid, f);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.created} 条需求`);
      onChanged();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert((err as Error).message || '导入失败');
    } finally {
      e.target.value = '';
    }
  }

  async function importMdFile(e: any) {
    const f = e.target.files?.[0];
    if (f) setMd(await f.text());
  }

  const linksOf = (reqId: number) => traceLinks.filter((l) => l.fromType === 'requirement' && l.fromId === reqId);

  return (
    <div className="grid2">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={() => setShowImport(!showImport)}>导入 Markdown</button>
          {showImport && (
            <span className="row">
              <input type="file" accept=".md,.markdown,.txt" onChange={importMdFile} />
              <button className="primary" onClick={importMd}>导入</button>
            </span>
          )}
          <button onClick={() => setShowCsv(!showCsv)}>导入 CSV</button>
          {showCsv && <button className="primary" onClick={importCsv}>导入</button>}
          <label className="row" style={{ gap: 4 }}>
            导入 Excel
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importXlsx} />
          </label>
        </div>
        {showImport && (
          <textarea rows={4} placeholder="粘贴 Markdown 需求（标题/列表行作为需求，支持 [R1] 编号）…" value={md} onChange={(e) => setMd(e.target.value)} style={{ marginBottom: 8 }} />
        )}
        {showCsv && (
          <textarea rows={4} placeholder={"粘贴 CSV：表头 code,title,description,priority,status,tags\n示例：R1,用户下单,支持下单,high,active"} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ marginBottom: 8 }} />
        )}
        <div className="row">
          <input placeholder="编号（可选）" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
          <input placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} className="grow" />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <textarea placeholder="描述" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="grow" />
          <select value={prio} onChange={(e) => setPrio(e.target.value)} style={{ width: 100 }}>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          <button className="primary" onClick={add}>添加</button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {requirements.map((r) => (
            <div key={r.id} className="card">
              <div style={{ fontWeight: 600 }}>{r.code ? `[${r.code}] ` : ''}{r.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>关联元素：</span>
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const elId = Number(e.target.value);
                    if (elId) {
                      await api.createTraceLink(pid, { fromType: 'requirement', fromId: r.id, toType: 'element', toId: elId, linkType: 'satisfies' });
                      onChanged();
                    }
                  }}
                >
                  <option value="">选择元素…</option>
                  {elements.map((el) => (
                    <option key={el.id} value={el.id}>{el.name}</option>
                  ))}
                </select>
                <button className="danger" onClick={async () => { await api.deleteRequirement(r.id); onChanged(); }}>删</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                已关联：{linksOf(r.id).length === 0 ? '无' : linksOf(r.id).map((l) => elements.find((e) => e.id === l.toId)?.name).filter(Boolean).join(', ')}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel muted" style={{ fontSize: 13 }}>
        <strong>说明</strong>
        <div>在容器视图下维护需求；每条需求可关联到某个容器元素，形成“需求 → 容器”的追溯。</div>
      </div>
    </div>
  );
}

// ---- 原型 ----
function PrototypesTab({ pid, prototypes, containerElements, traceLinks, onChanged }: { pid: number; prototypes: Prototype[]; containerElements: Element[]; traceLinks: TraceLink[]; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function addImage() {
    if (!file) return;
    const fd = new FormData();
    fd.append('name', name || file.name);
    fd.append('type', 'image');
    fd.append('file', file);
    await api.uploadPrototype(pid, fd);
    setName('');
    setFile(null);
    onChanged();
  }
  async function addUrl() {
    if (!url.trim()) return;
    await api.createPrototypeLink(pid, { name: name || url, type: 'url', uri: url });
    setName('');
    setUrl('');
    onChanged();
  }

  const linksOf = (protoId: number) => traceLinks.filter((l) => l.fromType === 'element' && l.toType === 'prototype' && l.toId === protoId);
  const containerName = (id: number) => containerElements.find((e) => e.id === id)?.name;

  return (
    <div className="grid2">
      <div>
        <div className="row">
          <input placeholder="原型名称" value={name} onChange={(e) => setName(e.target.value)} className="grow" />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="primary" onClick={addImage}>上传图片</button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input placeholder="原型 URL / Figma 链接" value={url} onChange={(e) => setUrl(e.target.value)} className="grow" />
          <button className="primary" onClick={addUrl}>添加链接</button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {prototypes.map((p) => (
            <div key={p.id} className="card row">
              {p.type === 'image' ? (
                <img src={p.uri} alt={p.name} style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 6 }} />
              ) : (
                <a href={p.uri} target="_blank" rel="noreferrer" style={{ width: 80, display: 'block', fontSize: 12, textAlign: 'center' }}>
                  打开链接 ↗
                </a>
              )}
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  挂接容器：{linksOf(p.id).length === 0 ? '无' : linksOf(p.id).map((l) => containerName(l.fromId)).filter(Boolean).join(', ')}
                </div>
                <div className="row" style={{ marginTop: 4 }}>
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const elId = Number(e.target.value);
                      if (elId) {
                        await api.createTraceLink(pid, { fromType: 'element', fromId: elId, toType: 'prototype', toId: p.id, linkType: 'shows' });
                        onChanged();
                      }
                    }}
                  >
                    <option value="">选择容器…</option>
                    {containerElements.map((el) => (
                      <option key={el.id} value={el.id}>{el.name}</option>
                    ))}
                  </select>
                  <button className="danger" onClick={async () => { await api.deletePrototype(p.id); onChanged(); }}>删</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel muted" style={{ fontSize: 13 }}>
        <strong>说明</strong>
        <div>上传界面截图或链接到原型；再将其挂接到某个容器元素，形成“容器 → 界面原型”的追溯。</div>
      </div>
    </div>
  );
}

// ---- 追溯矩阵 ----
function MatrixTab({ pid }: { pid: number }) {
  const [rows, setRows] = useState<TraceMatrixRow[]>([]);
  useEffect(() => {
    api.getMatrix(pid).then(setRows).catch(() => setRows([]));
  }, [pid]);
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>元素</th>
            <th>层级</th>
            <th>关联需求</th>
            <th>关联原型</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.elementId}>
              <td>{r.elementName}</td>
              <td>{LEVEL_NAME[r.level]}</td>
              <td>{r.requirementText || '—'}</td>
              <td>{r.prototypeText || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="muted" style={{ marginTop: 8 }}>暂无元素。</div>}
    </div>
  );
}

// ---- 影响分析 ----
function ImpactTab({ pid, elements, requirements }: { pid: number; elements: Element[]; requirements: Requirement[] }) {
  const [type, setType] = useState('element');
  const [oid, setOid] = useState<string>('');
  const [result, setResult] = useState<ImpactResult | null>(null);

  const items: any[] = type === 'element' ? elements : type === 'requirement' ? requirements : [];

  async function run() {
    if (!oid) return;
    setResult(await api.getImpact(pid, type, Number(oid)));
  }

  return (
    <div className="grid2">
      <div>
        <div className="row">
          <select value={type} onChange={(e) => { setType(e.target.value); setOid(''); }}>
            <option value="element">元素</option>
            <option value="requirement">需求</option>
          </select>
          <select value={oid} onChange={(e) => setOid(e.target.value)} className="grow">
            <option value="">选择对象…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{(it as any).name || (it as any).title}</option>
            ))}
          </select>
          <button className="primary" onClick={run}>分析影响</button>
        </div>
        {result && (
          <div className="panel" style={{ marginTop: 10 }}>
            <div>影响对象：<strong>{result.root.name}</strong></div>
            <div className="muted" style={{ margin: '6px 0' }}>受影响（{result.affected.length}）：</div>
            <div className="list">
              {result.affected.map((n, i) => (
                <div key={i} className="card" style={{ display: 'flex', gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{n.type}</span>
                  <span>{n.name}</span>
                </div>
              ))}
              {result.affected.length === 0 && <div className="muted">无直接影响对象。</div>}
            </div>
          </div>
        )}
      </div>
      <div className="panel muted" style={{ fontSize: 13 }}>
        <strong>说明</strong>
        <div>选择一个元素或需求，系统沿追溯链与容器关系扩散，列出所有受影响的对象，用于需求变更评估。</div>
      </div>
    </div>
  );
}

// ---- AI 与导出 ----
function AiTab({ pid, elements, relationships, onApply }: { pid: number; elements: Element[]; relationships: Relationship[]; onApply: () => void }) {
  const [text, setText] = useState('');
  const [aiOut, setAiOut] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [validateOut, setValidateOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [dsl, setDsl] = useState('');
  const [ruleIssues, setRuleIssues] = useState<{ type: string; message: string }[]>([]);
  const [showDsl, setShowDsl] = useState(false);
  const [codeDir, setCodeDir] = useState('');
  const [codeOut, setCodeOut] = useState('');
  const [codeSummary, setCodeSummary] = useState('');

  async function gen() {
    setBusy(true);
    setApplied(false);
    try {
      const r = await api.aiGenerate(pid, text);
      setAiOut(r.text);
      setDraft(r.draft);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '生成失败');
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api.aiApply(pid, draft);
      setApplied(true);
      onApply();
      // eslint-disable-next-line no-alert
      alert(`已应用 ${r.elements} 个元素、${r.relationships} 条关系`);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '采纳失败');
    } finally {
      setBusy(false);
    }
  }
  async function val() {
    setBusy(true);
    try {
      const r = await api.aiValidate(pid, 'all');
      setValidateOut(r.text);
      setIssues(r.issues || []);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '校验失败');
    } finally {
      setBusy(false);
    }
  }
  async function checkRules() {
    setBusy(true);
    try {
      setRuleIssues(await api.rulesValidate(pid));
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '静态校验失败');
    } finally {
      setBusy(false);
    }
  }
  async function importDsl() {
    if (!dsl.trim()) return;
    setBusy(true);
    try {
      const r = await api.importDSL(pid, dsl);
      // eslint-disable-next-line no-alert
      alert(`已导入 ${r.elements} 个元素、${r.relationships} 条关系`);
      setDsl('');
      setShowDsl(false);
      onApply();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || 'DSL 导入失败');
    } finally {
      setBusy(false);
    }
  }
  async function inferCode() {
    if (!codeDir.trim()) return;
    setBusy(true);
    setApplied(false);
    try {
      const r = await api.aiCode(pid, codeDir.trim());
      setCodeOut(r.text);
      setCodeSummary(r.summary || '');
      setDraft(r.draft);
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || '代码推断失败');
    } finally {
      setBusy(false);
    }
  }
  async function downloadPng() {
    const el = document.querySelector('.react-flow') as HTMLElement | null;
    if (!el) {
      // eslint-disable-next-line no-alert
      alert('请先切换到画布视图');
      return;
    }
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(el, { cacheBust: true, backgroundColor: '#f8fafc', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `archlens-${pid}.png`;
      a.click();
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert((e as Error).message || 'PNG 导出失败');
    }
  }
  async function download(format: string) {
    const content = await api.exportProject(pid, format);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `archlens-${pid}.${format === 'markdown' ? 'md' : format}`;
    a.click();
  }
  function downloadSvg() {
    const svg = buildSVG(elements, relationships);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `archlens-${pid}-diagram.svg`;
    a.click();
  }

  return (
    <div className="grid2">
      <div>
        <textarea rows={4} placeholder="粘贴需求/一段描述…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" onClick={gen} disabled={busy}>生成 C4 初稿</button>
        {draft && (
          <div className="panel" style={{ marginTop: 8 }}>
            <div className="row">
              <span style={{ fontWeight: 600 }}>
                识别到 {draft.elements?.length ?? 0} 元素、{draft.relationships?.length ?? 0} 关系
              </span>
              <button className="primary" onClick={apply} disabled={busy}>应用到画布</button>
            </div>
            {applied && <div className="muted" style={{ marginTop: 6, color: '#16a34a' }}>已应用，可在画布查看。</div>}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>AI 结果仅作初稿，应用后仍可编辑。</div>
          </div>
        )}
        {aiOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{aiOut}</pre>
        )}
      </div>
      <div>
        <button onClick={val} disabled={busy}>AI 一致性校验</button>
        {issues.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {issues.map((it, i) => (
              <div key={i} className="card" style={{ fontSize: 13 }}>{it}</div>
            ))}
          </div>
        )}
        {validateOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 8 }}>{validateOut}</pre>
        )}
      </div>
      <div className="row" style={{ gridColumn: '1 / -1' }}>
        <span className="muted" style={{ fontSize: 13 }}>导出（git 友好）：</span>
        <button onClick={() => download('dsl')}>Structurizr DSL</button>
        <button onClick={() => download('json')}>JSON</button>
        <button onClick={() => download('markdown')}>Markdown</button>
        <button className="primary" onClick={downloadSvg}>SVG（当前层级）</button>
        <button onClick={downloadPng}>PNG</button>
        <button onClick={() => download('html')}>HTML 报告</button>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <input placeholder="本地代码目录，如 D:\myapp（推断组件与依赖）" value={codeDir} onChange={(e) => setCodeDir(e.target.value)} className="grow" />
          <button className="primary" onClick={inferCode} disabled={busy}>代码仓库推断</button>
        </div>
        {codeSummary && (
          <details style={{ marginBottom: 8 }}>
            <summary className="muted" style={{ fontSize: 12 }}>查看代码摘要</summary>
            <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{codeSummary}</pre>
          </details>
        )}
        {codeOut && (
          <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 8 }}>{codeOut}</pre>
        )}
        <div className="row">
          <button onClick={() => setShowDsl(!showDsl)}>导入 Structurizr DSL</button>
          {showDsl && <button className="primary" onClick={importDsl} disabled={busy}>导入</button>}
          <button onClick={checkRules} disabled={busy}>静态校验（规则引擎）</button>
        </div>
        {showDsl && (
          <textarea
            rows={4}
            placeholder={'粘贴 Structurizr DSL：\nworkspace "X" {\n  model {\n    softwareSystem "订单系统" {\n      container "库存服务"\n    }\n    "库存服务" -> "支付服务" "调用"\n  }\n}'}
            value={dsl}
            onChange={(e) => setDsl(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}
        {ruleIssues.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {ruleIssues.map((it, i) => (
              <div key={i} className="card" style={{ fontSize: 13 }}>
                <span className="muted" style={{ marginRight: 6 }}>[{it.type}]</span>
                {it.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SVG_KIND: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
};
const SVG_COLOR: Record<string, string> = {
  person: '#7c3aed',
  softwareSystem: '#0f766e',
  container: '#1d4ed8',
  component: '#b45309',
};

function escapeXml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

// buildSVG 根据当前层级的元素与关系生成自包含 SVG 图。
function buildSVG(elements: Element[], relationships: Relationship[]): string {
  const W = 1000;
  const H = 700;
  if (elements.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f8fafc"/><text x="20" y="40" fill="#6b7280">当前层级暂无元素</text></svg>`;
  }
  const sizeOf = (t: string) =>
    t === 'softwareSystem' ? { w: 220, h: 110 } : t === 'container' ? { w: 170, h: 92 } : t === 'component' ? { w: 140, h: 78 } : { w: 96, h: 84 };
  const nodes = elements.map((e) => {
    const s = sizeOf(e.type);
    return { id: e.id, x: e.posX, y: e.posY, w: s.w, h: s.h, type: e.type, name: e.name };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  const pad = 40;
  const scale = Math.min(1, (W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY));
  const px = (x: number) => pad + (x - minX) * scale;
  const py = (y: number) => pad + (y - minY) * scale;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#f8fafc"/>`);
  for (const r of relationships) {
    const s = nodes.find((n) => n.id === r.sourceId);
    const t = nodes.find((n) => n.id === r.targetId);
    if (!s || !t) continue;
    const sx = px(s.x) + s.w * scale;
    const sy = py(s.y) + (s.h * scale) / 2;
    const tx = px(t.x);
    const ty = py(t.y) + (t.h * scale) / 2;
    parts.push(`<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#64748b" stroke-width="1.5"/>`);
    parts.push(`<polygon points="${tx},${ty} ${tx - 9},${ty - 4.5} ${tx - 9},${ty + 4.5}" fill="#64748b"/>`);
    parts.push(`<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 6}" font-size="11" fill="#475569" text-anchor="middle">${escapeXml(r.label || 'uses')}</text>`);
  }
  for (const n of nodes) {
    const x = px(n.x);
    const y = py(n.y);
    const w = n.w * scale;
    const h = n.h * scale;
    const c = SVG_COLOR[n.type] || '#94a3b8';
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="${c}" stroke-width="2"/>`);
    parts.push(`<text x="${x + w / 2}" y="${y + 20}" font-size="10" fill="#64748b" text-anchor="middle">${escapeXml(SVG_KIND[n.type] || n.type)}</text>`);
    parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 14}" font-size="14" font-weight="600" fill="#1f2937" text-anchor="middle">${escapeXml(n.name)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
