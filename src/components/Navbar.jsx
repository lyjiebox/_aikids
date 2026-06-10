/**
 * ============================================================
 * Navbar 组件 — 底部导航栏
 * ============================================================
 * 
 * 固定在页面底部，三个 Tab：
 * - 🏠 首页  → /
 * - 🎮 作品  → /gallery
 * - ⚙️ 设置  → /settings
 * 
 * 当前页面高亮（紫色）
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  const location = useLocation();  // 获取当前路由，用于高亮

  return (
    <nav className="navbar">
      {/* 首页 */}
      <Link to="/" className={'nav-item ' + (location.pathname === '/' ? 'active' : '')}>
        <span className="nav-icon">🏠</span>
        <span className="nav-text">首页</span>
      </Link>

      {/* 作品 */}
      <Link to="/gallery" className={'nav-item ' + (location.pathname === '/gallery' ? 'active' : '')}>
        <span className="nav-icon">🎮</span>
        <span className="nav-text">作品</span>
      </Link>

      {/* 设置 */}
      <Link to="/settings" className={'nav-item ' + (location.pathname === '/settings' ? 'active' : '')}>
        <span className="nav-icon">⚙️</span>
        <span className="nav-text">设置</span>
      </Link>
    </nav>
  );
}

export default Navbar;
