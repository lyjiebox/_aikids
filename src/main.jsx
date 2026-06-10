/**
 * ============================================================
 * main.jsx — 应用入口
 * ============================================================
 * 
 * 这是 Vite 构建的入口文件，负责：
 * 1. 挂载 React 应用到 #root DOM 节点
 * 2. 启用 React StrictMode（开发环境双重渲染检测副作用）
 * 3. 加载全局样式 index.css
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
