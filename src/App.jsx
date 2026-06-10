/**
 * ============================================================
 * App 根组件 — 路由配置 + 全局布局
 * ============================================================
 * 
 * 路由表：
 *   /              → Home（首页）
 *   /create        → Create（创作页）
 *   /play/:workId  → Play（游戏播放页）
 *   /gallery       → Gallery（作品列表页）
 *   /settings      → Settings（家长设置页）
 * 
 * 布局：
 *   AppProvider（全局状态）
 *     └── Router（路由）
 *           ├── Routes（页面内容）
 *           └── Navbar（底部导航栏，固定）
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Create from './pages/Create';
import Play from './pages/Play';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';
import Navbar from './components/Navbar';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="app">
          {/* 页面内容区 */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/play/:workId" element={<Play />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          {/* 底部导航栏：首页 / 作品 / 设置 */}
          <Navbar />
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
