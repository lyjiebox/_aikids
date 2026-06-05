import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import './Gallery.css';

function Gallery() {
  const navigate = useNavigate();
  const { state, deleteWork } = useAppContext();
  const [deleteId, setDeleteId] = useState(null);

  const handlePlay = (id) => {
    navigate(`/play/${id}`);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteWork(deleteId);
      setDeleteId(null);
    }
  };

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

  return (
    <div className="gallery-page">
      <div className="header">
        <h1 className="title">我的作品</h1>
        <span className="count">{state.works.length} 个</span>
      </div>

      <div className="works-grid">
        {state.works.map((work) => (
          <div
            key={work.id}
            className="game-card"
            onClick={() => handlePlay(work.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeleteId(work.id);
            }}
          >
            <div className="game-card-thumb">
              <span className="game-card-emoji">🎮</span>
            </div>
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
