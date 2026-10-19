/**
 * ============================================================
 * Settings 页面 — 家长设置
 * ============================================================
 *
 * 路由：/settings
 *
 * 安全机制：
 * - 进入前需要过 ParentGate（简单算术验证）
 * - 防止儿童随意修改设置
 *
 * 可配置项：
 * - 每日使用时长（10-60 分钟，默认 30）
 * - 单次使用时长（10-30 分钟，默认 20）
 * - 内容过滤级别（严格/适中）
 * - AI 模型配置入口（V3.2，进入 /settings/models）
 * - 清空所有作品
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getCurrentModelLabel } from '../services/model-utils';
import ParentGate from '../components/ParentGate';
import './Settings.css';

/**
 * Settings — 家长设置页
 */
function Settings() {
  const { state, updateSettings, dispatch } = useAppContext();
  // 同一会话内已验证过则不重复验证
  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem('aikids-parent-verified') === '1';
    } catch {
      return false;
    }
  });

  const handlePass = () => {
    try {
      sessionStorage.setItem('aikids-parent-verified', '1');
    } catch {
      // 忽略存储失败
    }
    setAuthenticated(true);
  };

  // 未验证 → 显示 ParentGate
  if (!authenticated) {
    return (
      <div className="settings-page auth">
        <ParentGate onPass={handlePass} />
      </div>
    );
  }

  const modelSummary = getCurrentModelLabel(
    state.models,
    state.selectedModelId
  );

  // 已验证 → 显示设置项
  return (
    <div className="settings-page">
      <div className="header">
        <h1 className="title">家长设置</h1>
      </div>

      <div className="content">
        {/* 每日使用时长 */}
        <div className="setting-item">
          <div className="setting-label">
            <span className="label-text">每日使用时长</span>
            <span className="label-value">{state.settings.dailyTimeLimit} 分钟</span>
          </div>
          <input
            type="range"
            min="10"
            max="60"
            value={state.settings.dailyTimeLimit}
            onChange={(e) => updateSettings({ dailyTimeLimit: Number(e.target.value) })}
            className="setting-slider"
          />
        </div>

        {/* 单次使用时长 */}
        <div className="setting-item">
          <div className="setting-label">
            <span className="label-text">单次使用时长</span>
            <span className="label-value">{state.settings.sessionTimeLimit} 分钟</span>
          </div>
          <input
            type="range"
            min="10"
            max="30"
            value={state.settings.sessionTimeLimit}
            onChange={(e) => updateSettings({ sessionTimeLimit: Number(e.target.value) })}
            className="setting-slider"
          />
        </div>

        {/* 内容过滤级别（当前仅展示，未实现实际过滤逻辑） */}
        <div className="setting-item">
          <div className="setting-label">
            <span className="label-text">内容过滤</span>
            <span className="label-value">
              {state.settings.contentFilterLevel === 'strict' ? '严格' : '适中'}
            </span>
          </div>
        </div>

        <div className="setting-divider"></div>

        {/* V3.2：AI 模型配置入口（需家长验证后可见） */}
        <Link to="/settings/models" className="setting-item setting-link">
          <div className="setting-label">
            <span className="label-text">🤖 AI 模型配置</span>
            <span className="label-value model-summary" title={modelSummary}>
              {modelSummary}
            </span>
          </div>
          <span className="setting-arrow">→</span>
        </Link>

        <div className="setting-divider"></div>

        {/* 清空所有作品（危险操作，二次确认） */}
        <button
          className="clear-btn"
          onClick={() => {
            if (confirm('确认清空所有作品吗？此操作不可恢复！')) {
              dispatch({ type: 'SET_WORKS', payload: [] });
            }
          }}
        >
          🗑️ 清空所有作品
        </button>
      </div>

      <div className="bottom-spacer"></div>
    </div>
  );
}

export default Settings;
