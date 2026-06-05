import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar">
      <Link to="/" className={'nav-item ' + (location.pathname === '/' ? 'active' : '')}>
        <span className="nav-icon">🏠</span>
        <span className="nav-text">首页</span>
      </Link>
      <Link to="/gallery" className={'nav-item ' + (location.pathname === '/gallery' ? 'active' : '')}>
        <span className="nav-icon">🎮</span>
        <span className="nav-text">作品</span>
      </Link>
      <Link to="/settings" className={'nav-item ' + (location.pathname === '/settings' ? 'active' : '')}>
        <span className="nav-icon">⚙️</span>
        <span className="nav-text">设置</span>
      </Link>
    </nav>
  );
}

export default Navbar;
