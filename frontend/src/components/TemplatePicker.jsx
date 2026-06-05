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
