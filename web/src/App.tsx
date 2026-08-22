import { Routes, Route, Link } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ModelPage from './pages/ModelPage';

export default function App() {
  return (
    <div className="app">
      <div className="topbar">
        <Link to="/" style={{ fontWeight: 700, textDecoration: 'none', color: '#111' }}>
          ArchLens
        </Link>
        <span className="muted" style={{ fontSize: 12 }}>
          C4 架构设计 · 需求 / 原型 / 追溯
        </span>
      </div>
      <div className="body">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/project/:id" element={<ModelPage />} />
        </Routes>
      </div>
    </div>
  );
}
