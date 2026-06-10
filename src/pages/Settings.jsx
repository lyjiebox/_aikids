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
 * - 清空所有作品
 */

import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import './Settings.css';

/**
 * ParentGate — 家长验证门
 * 
 * 生成一道随机加法题（1-10 + 1-10），
 * 答对才能进入设置页。
 * 答错不锁定，可以无限重试。
 */
function ParentGate({ onPass }) {
  // 随机生成两个 1-10 的数字
  const [a] = useState(Math.floor(Math.random() * 10) + 1);
  const [b] = useState(Math.floor(Math.random() * 10) + 1);
  const [input, setInput] = useState('');     // 用户输入
  const [error, setError] = useState('');     // 错误提示

  /** 验证答案 */
  const handleSubmit = () => {
    const val = Number(input.trim());
    if (!Number.isFinite(val)) {
      setError('请输入数字');
      return;
    }
    if (val === a + b) {
      setError('');
      onPass();  // 验证通过，进入设置页
    } else {
      setError('答案不正确，请再试一次');
      setInput('');
    }
  };

  return (
    <div className="parentgate-mask">
      <div className="parentgate-card">
        <h2 className="parentgate-title">家长验证</h2>
        <p className="parentgate-question">{a} + {b} = ?</p>
        <input
          className="parentgate-input"
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入答案"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();  // 回车提交
          }}
        />
        {error && <p className="parentgate-error">{error}</p>}
        <div className="parentgate-actions">
          <button className="parentgate-btn parentgate-btn-confirm" onClick={handleSubmit}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Settings — 家长设置页
 */
function Settings() {
  const { state, updateSettings, dispatch } = useAppContext();
  const [authenticated, setAuthenticated] = useState(false);  // 是否通过验证

  // 未验证 → 显示 ParentGate
  if (!authenticated) {
    return (
      <div className="settings-page auth">
        <ParentGate onPass={() => setAuthenticated(true)} />
      </div>
    );
  }

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
