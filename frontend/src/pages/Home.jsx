import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TEMPLATES } from '../config/site';
import './Home.css';

function Home() {
  const navigate = useNavigate();

  const handleCreate = () => {
    navigate('/create');
  };

  const handleTemplateSelect = (templateId) => {
    navigate(`/create?templateId=${templateId}`);
  };

  return (
    <div className="home-page">
      <div className="header">
        <span className="logo">🎮</span>
        <h1 className="title">AI 魔法游戏</h1>
      </div>

      <div className="main-cta">
        <button className="create-btn" onClick={handleCreate}>
          🎤 说出你的游戏创意
        </button>
      </div>

      <div className="templates-section">
        <h2 className="section-title">或者选一个主题开始 →</h2>
        <div className="templates-scroll">
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

      <div className="bottom-spacer"></div>
    </div>
  );
}

export default Home;
