/**
 * ============================================================
 * TemplatePicker 组件 — 模板选择器
 * ============================================================
 * 
 * 3 列网格展示所有游戏模板，点击选中高亮（紫色边框）。
 * 
 * 使用方式：
 *   <TemplatePicker selected={currentId} onSelect={setCurrentId} />
 */

import React from 'react';
import { TEMPLATES } from '../config/site';
import './TemplatePicker.css';

function TemplatePicker({ selected, onSelect }) {
  return (
    <div className="templatepicker-wrapper">
      <div className="templatepicker-grid">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className={'templatepicker-card ' + (selected === t.id ? 'templatepicker-card-selected' : '')}
            onClick={() => onSelect(t.id)}
          >
            <span className="templatepicker-icon">{t.icon}</span>
            <span className="templatepicker-name">{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TemplatePicker;
