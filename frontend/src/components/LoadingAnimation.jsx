import React from 'react';
import './LoadingAnimation.css';

function LoadingAnimation({ text = '正在生成游戏，请稍候...' }) {
  return (
    <div className="loading-wrapper">
      <div className="loading-spinner">
        <div className="loading-dot loading-dot-1"></div>
        <div className="loading-dot loading-dot-2"></div>
        <div className="loading-dot loading-dot-3"></div>
      </div>
      <p className="loading-text">{text}</p>
    </div>
  );
}

export default LoadingAnimation;
