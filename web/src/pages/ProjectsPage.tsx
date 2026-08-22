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
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <h2>我的架构项目</h2>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row">
          <input
            placeholder="项目名称，如：电商平台"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="grow"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <input placeholder="简介（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button className="primary" onClick={create}>
            新建
          </button>
        </div>
        {err && <div className="muted" style={{ color: '#dc2626', marginTop: 8 }}>{err}</div>}
      </div>

      <div className="list">
        {projects.length === 0 && <div className="muted">还没有项目，先新建一个。</div>}
        {projects.map((p) => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {p.description || '（无描述）'}
              </div>
            </div>
            <button
              className="primary"
              onClick={() => nav(`/project/${p.id}`)}
            >
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
