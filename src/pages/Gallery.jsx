/**
 * ============================================================
 * Gallery 页面 — 作品列表
 * ============================================================
 * 
 * 路由：/gallery
 * 
 * 功能：
 * - 网格展示所有已保存的作品（2 列布局）
 * - 每个作品卡片显示：emoji 缩略图 + 标题 + 日期 + 游玩次数
 * - 点击卡片 → 跳转播放页
 * - 右键/长按 → 弹出删除确认弹窗
 * - 空状态：引导用户去创作
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import './Gallery.css';

function Gallery() {
  const navigate = useNavigate();
  const { state, deleteWork } = useAppContext();
  const [deleteId, setDeleteId] = useState(null);  // 待删除的作品 ID

  /** 点击卡片 → 跳转播放页 */
  const handlePlay = (id) => {
    navigate(`/play/${id}`);
  };

  /** 确认删除作品 */
  const confirmDelete = () => {
    if (deleteId) {
      deleteWork(deleteId);
      setDeleteId(null);
    }
  };

  // ============================================================
  // 空状态：还没有作品
  // ============================================================
  if (state.works.length === 0) {
    return (
      <div className="gallery-page empty">
        <span className="empty-icon">🎮</span>
        <h2 className="empty-text">还没有作品哦</h2>
        <p className="empty-hint">去首页创作一个吧！</p>
        <button className="go-create-btn" onClick={() => navigate('/')}>
          去创作
        </button>
        <div className="bottom-spacer"></div>
      </div>
    );
  }

  // ============================================================
  // 正常状态：作品网格
  // ============================================================
  return (
    <div className="gallery-page">
      {/* 顶部：标题 + 作品数量 */}
      <div className="header">
        <h1 className="title">我的作品</h1>
        <span className="count">{state.works.length} 个</span>
      </div>

      {/* 作品网格（2 列） */}
      <div className="works-grid">
        {state.works.map((work) => (
          <div
            key={work.id}
            className="game-card"
            onClick={() => handlePlay(work.id)}
            onContextMenu={(e) => {
              e.preventDefault();           // 阻止浏览器默认右键菜单
              setDeleteId(work.id);         // 显示删除弹窗
            }}
          >
            {/* 缩略图区域（渐变色背景 + emoji） */}
            <div className="game-card-thumb">
              <span className="game-card-emoji">🎮</span>
            </div>
            {/* 信息区域 */}
            <div className="game-card-info">
              <h3 className="game-card-title">{work.title}</h3>
              <p className="game-card-meta">
                {new Date(work.createdAt).toLocaleDateString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric'
                })} · 玩了 {work.playCount} 次
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bottom-spacer"></div>

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <h3 className="modal-title">确认删除这个作品吗？</h3>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button className="modal-btn confirm" onClick={confirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Gallery;
