import React, { useState } from 'react';
import './RemixModal.css';

function RemixModal({ isOpen, onClose, onConfirm }) {
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setError('请说说你想怎么改');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  if (!isOpen) return null;

  return (
    <div className="remix-modal-mask">
      <div className="remix-modal-card">
        <h2 className="remix-modal-title">🔄 改编这个游戏</h2>
        <p className="remix-modal-subtitle">说说你想怎么改？</p>

        <textarea
          className="remix-modal-input"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="比如：加个 Boss 关、换成海底主题、增加关卡"
          rows={4}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />

        {error && <p className="remix-modal-error">{error}</p>}

        <div className="remix-modal-actions">
          <button className="remix-modal-btn remix-modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="remix-modal-btn remix-modal-btn-confirm" onClick={handleConfirm}>
            ✨ 生成新游戏
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemixModal;
