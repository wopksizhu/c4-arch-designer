import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Project } from '../types';

export default function ProjectsPage() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');

  const reload = () => api.listProjects().then(setProjects).catch((e) => setErr(e.message));
  useEffect(() => {
    reload();
  }, []);

  async function create() {
    if (!name.trim()) return;
    try {
      const p = await api.createProject({ name: name.trim(), description: desc });
      nav(`/project/${p.id}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>我的架构项目</h2>
        <div className="sub">用 C4 建模，把需求与界面原型关联到架构元素，并做追溯与影响分析。</div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="row wrap">
          <input
            placeholder="项目名称（必填），如：电商平台"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: '1 1 260px', minWidth: 220 }}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <input placeholder="简介（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: '0 1 220px' }} />
          <button className="primary" onClick={create}>
            新建
          </button>
        </div>
        {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
      </div>

      <div className="list">
        {projects.length === 0 && (
          <div className="empty">
            <div className="big">🗂️</div>
            <div>还没有项目，先新建一个。</div>
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="grow">
              <div className="title">{p.name}</div>
              <div className="subs">{p.description || '（无描述）'}</div>
            </div>
            <button className="primary" onClick={() => nav(`/project/${p.id}`)}>
              打开
            </button>
            <button
              className="danger"
              onClick={async () => {
                await api.deleteProject(p.id);
                reload();
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
