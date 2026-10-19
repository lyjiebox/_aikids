/**
 * ============================================================
 * ModelPicker — 首页模型选择器（V3.2）
 * ============================================================
 *
 * 位置：首页下部中间。
 * 默认选择「环境变量」，即请求不携带模型参数，
 * 由后端按 GAME_MODEL 解析默认模型。
 */

import React from 'react';
import { useAppContext } from '../context/AppContext';
import { getCurrentModelLabel } from '../services/model-utils';
import './ModelPicker.css';

function ModelPicker() {
  const { state, selectModel } = useAppContext();
  const { models, selectedModelId } = state;

  const availableEnv = (models.env || []).filter((item) => item.available);
  const customModels = models.custom || [];

  let autoLabel = '环境变量';
  if (models.loading) {
    autoLabel = '环境变量（加载中…）';
  } else if (models.error) {
    autoLabel = '环境变量（无法获取配置）';
  } else if (models.defaultModelName) {
    autoLabel = `环境变量（默认：${models.defaultModelName}）`;
  } else {
    autoLabel = '环境变量（未配置默认模型）';
  }

  return (
    <div className="model-picker">
      <div className="model-picker-header">
        <span className="model-picker-title">🤖 生成模型</span>
        <span className="model-picker-current" title={getCurrentModelLabel(models, selectedModelId)}>
          {getCurrentModelLabel(models, selectedModelId)}
        </span>
      </div>

      <select
        className="model-picker-select"
        aria-label="选择生成模型"
        value={selectedModelId || ''}
        onChange={(event) => selectModel(event.target.value || null)}
      >
        <option value="">{autoLabel}</option>

        {availableEnv.length > 0 && (
          <optgroup label="环境变量模型">
            {availableEnv.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        )}

        {customModels.length > 0 && (
          <optgroup label="自定义模型">
            {customModels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <p className={`model-picker-hint ${models.error ? 'error' : ''}`}>
        {models.error
          ? `⚠️ ${models.error}`
          : models.loading
            ? '正在获取环境模型配置…'
            : !models.defaultModelId && customModels.length === 0
              ? '环境变量未配置模型，生成将使用本地模板'
              : '默认使用服务器环境变量配置的模型'}
      </p>
    </div>
  );
}

export default ModelPicker;
