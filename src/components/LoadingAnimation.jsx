/**
 * ============================================================
 * LoadingAnimation 组件 — AI 生成等待动画
 * ============================================================
 * 
 * 三个彩色圆点上下弹跳 + 提示文字。
 * 用于 AI 生成游戏时的等待界面。
 * 
 * 使用方式：
 *   <LoadingAnimation text="🔥 AI 正在创作你的游戏..." />
 */

import React from 'react';
import './LoadingAnimation.css';

function LoadingAnimation({ text = '正在生成游戏，请稍候...' }) {
  return (
    <div className="loading-wrapper">
      {/* 三个弹跳圆点：粉 → 黄 → 蓝 */}
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
