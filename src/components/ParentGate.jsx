/**
 * ============================================================
 * ParentGate — 家长验证门（V3.2 抽取为公共组件）
 * ============================================================
 *
 * 生成一道随机加法题（1-10 + 1-10），答对才能进入家长设置
 * 或模型配置页。答错不锁定，可以无限重试。
 */

import React, { useState } from 'react';
import './ParentGate.css';

function ParentGate({ onPass }) {
  // 随机生成两个 1-10 的数字
  const [a] = useState(Math.floor(Math.random() * 10) + 1);
  const [b] = useState(Math.floor(Math.random() * 10) + 1);
  const [input, setInput] = useState(''); // 用户输入
  const [error, setError] = useState(''); // 错误提示

  /** 验证答案 */
  const handleSubmit = () => {
    const val = Number(input.trim());
    if (!Number.isFinite(val)) {
      setError('请输入数字');
      return;
    }
    if (val === a + b) {
      setError('');
      onPass(); // 验证通过
    } else {
      setError('答案不正确，请再试一次');
      setInput('');
    }
  };

  return (
    <div className="parentgate-mask">
      <div className="parentgate-card">
        <h2 className="parentgate-title">家长验证</h2>
        <p className="parentgate-question">
          {a} + {b} = ?
        </p>
        <input
          className="parentgate-input"
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入答案"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit(); // 回车提交
          }}
        />
        {error && <p className="parentgate-error">{error}</p>}
        <div className="parentgate-actions">
          <button
            className="parentgate-btn parentgate-btn-confirm"
            onClick={handleSubmit}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

export default ParentGate;
