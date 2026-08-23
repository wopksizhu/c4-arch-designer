import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ModelPage from './pages/ModelPage';
import HelpPanel from './components/HelpPanel';
import C4Guide from './components/C4Guide';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [help, setHelp] = useState(false);
  const [guide, setGuide] = useState(false);
  return (
    <ErrorBoundary>
      <div className="app">
        <div className="topbar">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span className="brand">Arch<span>Lens</span></span>
          </Link>
          <span className="muted" style={{ fontSize: 13 }}>
            C4 架构设计 · 需求 / 原型 / 追溯
          </span>
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={() => setGuide(true)}>C4 指南</button>
          <button className="ghost" onClick={() => setHelp(true)}>使用说明</button>
        </div>
        <div className="body">
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<ModelPage />} />
          </Routes>
        </div>
        {help && <HelpPanel onClose={() => setHelp(false)} />}
        {guide && <C4Guide onClose={() => setGuide(false)} />}
      </div>
    </ErrorBoundary>
  );
}
