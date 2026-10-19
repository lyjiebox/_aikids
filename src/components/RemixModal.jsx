import React, { useEffect, useMemo, useState } from 'react';
import {
  analyzeGameProfile,
  getRemixPreserveLabels,
} from '../services/remix';
import './RemixModal.css';

const QUICK_IDEAS = [
  '加一个 Boss',
  '速度更快一点',
  '换成海底背景',
  '增加一条命',
];

function RemixModal({ isOpen, onClose, onConfirm, work }) {
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState('');

  // 原游戏结构档案：仅用于向孩子/家长解释「会保留什么」
  const profile = useMemo(
    () => (work ? analyzeGameProfile(work.gameHtml, {
      title: work.title,
      templateId: work.templateId,
    }) : null),
    [work]
  );
  const preserveLabels = useMemo(
    () => getRemixPreserveLabels(profile),
    [profile]
  );

  // 每次打开弹窗重置输入
  useEffect(() => {
    if (isOpen) {
      setInstruction('');
      setError('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError('请说说你想怎么改');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  const appendIdea = (idea) => {
    setInstruction((prev) => (prev.trim() ? `${prev.trim()}，${idea}` : idea));
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="remix-modal-mask">
      <div className="remix-modal-card">
        <h2 className="remix-modal-title">🔄 改编这个游戏</h2>

        {work ? (
          <div className="remix-modal-source">
            <div className="remix-modal-source-title">
              🎮 基于《{work.title}》改编
            </div>
            {preserveLabels.length > 0 && (
              <div className="remix-modal-preserve">
                <span className="remix-modal-preserve-label">会保留：</span>
                {preserveLabels.map((label) => (
                  <span className="remix-modal-chip" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            )}
            <p className="remix-modal-source-hint">
              只改你要求的部分，不会重新生成一个完全不同的游戏。
            </p>
          </div>
        ) : (
          <p className="remix-modal-subtitle">说说你想怎么改？</p>
        )}

        <textarea
          className="remix-modal-input"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="比如：加个 Boss 关、换成海底主题、增加一条命"
          rows={4}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />

        <div className="remix-quick-ideas">
          {QUICK_IDEAS.map((idea) => (
            <button
              type="button"
              key={idea}
              className="remix-quick-idea"
              onClick={() => appendIdea(idea)}
            >
              {idea}
            </button>
          ))}
        </div>

        {error && <p className="remix-modal-error">{error}</p>}

        <div className="remix-modal-actions">
          <button className="remix-modal-btn remix-modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="remix-modal-btn remix-modal-btn-confirm" onClick={handleConfirm}>
            🧬 保留原玩法，开始改编
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemixModal;
