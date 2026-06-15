/**
 * ============================================================
 * Play 页面 — 游戏播放器
 * ============================================================
 * 
 * 路由：/play/:workId
 * 
 * 功能：
 * - 从全局状态中根据 workId 找到对应作品
 * - 在 iframe 沙箱中运行 AI 生成的 HTML5 游戏
 * - 自动记录游玩次数
 * - 顶部浮动栏显示游戏标题和退出按钮
 * 
 * 安全措施：
 * - iframe sandbox="allow-scripts allow-same-origin"
 * - 不允许顶层导航、弹窗、表单提交
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import RemixModal from '../components/RemixModal';
import './Play.css';

function Play() {
  const { workId } = useParams();          // URL 参数：作品 ID
  const navigate = useNavigate();           // 路由跳转
  const { state, incrementPlayCount } = useAppContext();
  const [showRemixModal, setShowRemixModal] = useState(false);

  const handleRemixConfirm = (instruction) => {
    const remixContext = {
      remixFrom: work.id,
      remixInstruction: instruction,
      originalTitle: work.title,
      originalUserPrompt: work.userPrompt,
      originalGameHtml: work.gameHtml.slice(0, 300),
      templateId: work.templateId
    };
    sessionStorage.setItem('aikids-remix-context', JSON.stringify(remixContext));
    navigate('/create?remix=1');
  };

  // 从作品列表中查找当前作品
  const work = useMemo(() => 
    state.works.find(w => w.id === workId), 
    [state.works, workId]
  );

  // 用 ref 防止 React StrictMode 下 useEffect 触发两次
  const countedRef = useRef(false);

  // 进入页面时记录游玩次数（只记一次）
  useEffect(() => {
    if (work && !countedRef.current) {
      countedRef.current = true;
      incrementPlayCount(work.id);
    }
  }, [work, incrementPlayCount]);

  // 作品不存在时显示 404 提示
  if (!work) {
    return (
      <div className="play-page not-found">
        <h2>游戏不存在</h2>
        <button className="back-btn" onClick={() => navigate('/gallery')}>
          返回作品列表
        </button>
      </div>
    );
  }

  return (
    <div className="play-page">
      {/* 顶部浮动栏：退出按钮 + 游戏标题 + Remix 按钮 */}
      <div className="top-bar">
        <button className="close-btn" onClick={() => navigate('/gallery')}>✕</button>
        <h1 className="game-title">{work.title}</h1>
        <button className="remix-btn" onClick={() => setShowRemixModal(true)}>🔄 Remix</button>
      </div>
      <RemixModal
        isOpen={showRemixModal}
        onClose={() => setShowRemixModal(false)}
        onConfirm={handleRemixConfirm}
      />

      {/* iframe 沙箱运行游戏 */}
      <div className="game-iframe-container">
        <iframe
          srcDoc={work.gameHtml}
          className="game-iframe"
          title={work.title}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

export default Play;
