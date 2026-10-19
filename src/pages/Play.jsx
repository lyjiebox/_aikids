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
 * - iframe sandbox="allow-scripts"（V3.2 移除 allow-same-origin）
 * - 生成游戏无法访问父页面 localStorage / 模型 API Key
 * - 不允许顶层导航、弹窗、表单提交
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import RemixModal from '../components/RemixModal';
import { createRemixContext } from '../services/remix';
import './Play.css';

function Play() {
  const { workId } = useParams();          // URL 参数：作品 ID
  const navigate = useNavigate();           // 路由跳转
  const { state, incrementPlayCount, deleteWork } = useAppContext();
  const [showRemixModal, setShowRemixModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 从作品列表中查找当前作品
  const work = useMemo(() =>
    state.works.find(w => w.id === workId),
    [state.works, workId]
  );

  // Remix 来源标题：优先作品自身留存，其次当前列表，最后兜底
  const remixSourceTitle = useMemo(() => {
    if (!work?.remixFrom) return '';
    if (work.remixFromTitle) return work.remixFromTitle;
    const original = state.works.find(w => w.id === work.remixFrom);
    return original ? original.title : '原游戏';
  }, [work, state.works]);

  const handleRemixConfirm = (instruction) => {
    if (!work) return;
    // V3.3：透传完整 gameHtml（不再 slice 300 字符），服务端据此分析并保留原框架
    const remixContext = createRemixContext(work, instruction);
    sessionStorage.setItem('aikids-remix-context', JSON.stringify(remixContext));
    navigate('/create?remix=1');
  };

  const handleDeleteConfirm = () => {
    deleteWork(workId);
    navigate('/gallery');
  };

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
      {/* 顶部浮动栏：退出按钮 + 游戏标题 + Remix 按钮 + 删除按钮 */}
      <div className="top-bar">
        <button className="close-btn" onClick={() => navigate('/gallery')}>✕</button>
        <div className="game-title-wrap">
          <h1 className="game-title">{work.title}</h1>
          {work.remixFrom && (
            <span className="play-remix-badge">
              🔄 改编自《{remixSourceTitle}》
              {work.remixAudit?.preserved ? ' · 已保留原玩法' : ''}
            </span>
          )}
        </div>
        <div className="top-bar-buttons">
          <button className="remix-btn" onClick={() => setShowRemixModal(true)}>🔄 Remix</button>
          <button className="delete-btn" onClick={() => setShowDeleteModal(true)}>🗑️ 删除</button>
        </div>
      </div>
      <RemixModal
        isOpen={showRemixModal}
        onClose={() => setShowRemixModal(false)}
        onConfirm={handleRemixConfirm}
        work={work}
      />

      {/* iframe 沙箱运行游戏 */}
      <div className="game-iframe-container">
        <iframe
          srcDoc={work.gameHtml}
          className="game-iframe"
          title={work.title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteModal && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <h3 className="modal-title">确认删除这个作品吗？</h3>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(false)}>
                取消
              </button>
              <button className="modal-btn confirm" onClick={handleDeleteConfirm}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Play;
