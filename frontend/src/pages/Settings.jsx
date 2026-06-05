import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import './Settings.css';

function ParentGate({ onPass }) {
  const [a] = useState(Math.floor(Math.random() * 10) + 1);
  const [b] = useState(Math.floor(Math.random() * 10) + 1);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const val = Number(input.trim());
    if (!Number.isFinite(val)) {
      setError('请输入数字');
      return;
    }
    if (val === a + b) {
      setError('');
      onPass();
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
            if (e.key === 'Enter') handleSubmit();
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

function Settings() {
  const { state, updateSettings, dispatch } = useAppContext();
  const [authenticated, setAuthenticated] = useState(false);

  if (!authenticated) {
    return (
      <div className="settings-page auth">
        <ParentGate onPass={() => setAuthenticated(true)} />
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="header">
      <h1 className="title">家长设置</h1>
      </div>

      <div className="content">
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

        <div className="setting-item">
          <div className="setting-label">
            <span className="label-text">内容过滤</span>
            <span className="label-value">
              {state.settings.contentFilterLevel === 'strict' ? '严格' : '适中'}
            </span>
          </div>
        </div>

        <div className="setting-divider"></div>

        <button
          className="clear-btn"
          onClick={() => {
            if (confirm('确认清空所有作品吗？')) {
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
