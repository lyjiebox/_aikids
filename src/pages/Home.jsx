/**
 * ============================================================
 * Home 页面 — 首页
 * ============================================================
 * 
 * 路由：/
 * 
 * 功能：
 * - 展示 App Logo + 名称
 * - 中央大按钮「🎤 说出你的游戏创意」→ 跳转创作页
 * - 下方横向模板卡片（精选 4 个）→ 点击跳转创作页并预选模板
 * - 底部 Navbar 导航
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TEMPLATES } from '../config/site';
import './Home.css';

function Home() {
  const navigate = useNavigate();

  /** 跳转创作页（自由模式） */
  const handleCreate = () => {
    navigate('/create');
  };

  /** 跳转创作页并预选模板 */
  const handleTemplateSelect = (templateId) => {
    navigate(`/create?templateId=${templateId}`);
  };

  return (
    <div className="home-page">
      {/* 顶部：Logo + 应用名称 */}
      <div className="header">
        <span className="logo">🎮</span>
        <h1 className="title">AI 魔法游戏</h1>
      </div>

      {/* 中央大按钮：主要 CTA */}
      <div className="main-cta">
        <button className="create-btn" onClick={handleCreate}>
          🎤 说出你的游戏创意
        </button>
      </div>

      {/* 模板选择区：横向卡片 */}
      <div className="templates-section">
        <h2 className="section-title">或者选一个主题开始 →</h2>
        <div className="templates-scroll">
          {/* 跳过第一个"自由创作"，展示 4 个精选模板 */}
          {TEMPLATES.slice(1, 5).map((t) => (
            <div
              key={t.id}
              className="template-card"
              onClick={() => handleTemplateSelect(t.id)}
            >
              <span className="template-icon">{t.icon}</span>
              <span className="template-name">{t.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部留白（避免被 Navbar 遮挡） */}
      <div className="bottom-spacer"></div>
    </div>
  );
}

export default Home;
