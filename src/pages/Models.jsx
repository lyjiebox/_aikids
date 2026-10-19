/**
 * ============================================================
 * Models 页面 — AI 模型配置（V3.2）
 * ============================================================
 *
 * 路由：/settings/models（需要家长验证）
 *
 * 功能：
 * - 展示环境变量模型（只读 + 测试）
 * - 添加 / 编辑 / 删除自定义模型（localStorage）
 * - 测试模型：只验证配置参数能否完成调用并返回文本，不生成游戏
 * - 高级配置入口预留：提示词优化 / 最长提示词 / 最长等待时间
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { testModel } from '../services/api';
import ParentGate from '../components/ParentGate';
import {
  DEFAULT_MODEL_BASE_URL,
  MAX_CUSTOM_MODELS,
  MODEL_PRESETS,
  generateModelId,
  getHostFromUrl,
  maskApiKey,
  validateCustomModel,
} from '../services/model-utils';
import './Models.css';

function formatLatency(latencyMs) {
  if (typeof latencyMs !== 'number' || latencyMs < 0) return '';
  if (latencyMs < 1000) return `${latencyMs}ms`;
  return `${(latencyMs / 1000).toFixed(1)}s`;
}

function Models() {
  const navigate = useNavigate();
  const {
    state,
    addCustomModel,
    updateCustomModel,
    deleteCustomModel,
    refreshModels,
  } = useAppContext();

  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem('aikids-parent-verified') === '1';
    } catch {
      return false;
    }
  });
  const [editing, setEditing] = useState(null); // { mode:'add'|'edit', id?, createdAt? }
  const [form, setForm] = useState({ name: '', baseUrl: '', model: '', apiKey: '' });
  const [presetId, setPresetId] = useState('ark');
  const [formErrors, setFormErrors] = useState({});
  const [clearKey, setClearKey] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});

  const handlePass = () => {
    try {
      sessionStorage.setItem('aikids-parent-verified', '1');
    } catch {
      // 忽略存储失败
    }
    setAuthenticated(true);
  };

  const models = state.models;
  const envModels = models.env || [];
  const customModels = models.custom || [];

  if (!authenticated) {
    return (
      <div className="models-page auth">
        <ParentGate onPass={handlePass} />
      </div>
    );
  }

  // ============================================================
  // 表单
  // ============================================================
  const openAdd = () => {
    setEditing({ mode: 'add' });
    setForm({
      name: '',
      baseUrl: DEFAULT_MODEL_BASE_URL,
      model: '',
      apiKey: '',
    });
    setPresetId('ark');
    setFormErrors({});
    setClearKey(false);
  };

  const openEdit = (item) => {
    setEditing({ mode: 'edit', id: item.id, createdAt: item.createdAt });
    setForm({
      name: item.name,
      baseUrl: item.baseUrl,
      model: item.model,
      apiKey: '',
    });
    const matched = MODEL_PRESETS.find(
      (preset) => preset.baseUrl && preset.baseUrl === item.baseUrl
    );
    setPresetId(matched ? matched.id : 'custom');
    setFormErrors({});
    setClearKey(false);
  };

  const closeModal = () => {
    setEditing(null);
    setFormErrors({});
  };

  const handleField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handlePresetChange = (value) => {
    setPresetId(value);
    const preset = MODEL_PRESETS.find((item) => item.id === value);
    if (preset && preset.baseUrl) {
      setForm((prev) => ({ ...prev, baseUrl: preset.baseUrl }));
      if (formErrors.baseUrl) {
        setFormErrors((prev) => ({ ...prev, baseUrl: undefined }));
      }
    }
  };

  const handleSave = () => {
    if (!editing) return;

    const validation = validateCustomModel(form, {
      envModels,
      customModels,
      editingId: editing.mode === 'edit' ? editing.id : null,
    });

    if (!validation.ok) {
      setFormErrors(validation.errors);
      return;
    }

    const now = Date.now();
    const value = validation.value;

    if (editing.mode === 'add') {
      if (customModels.length >= MAX_CUSTOM_MODELS) {
        setFormErrors({ name: `最多只能添加 ${MAX_CUSTOM_MODELS} 个自定义模型` });
        return;
      }
      addCustomModel({
        id: generateModelId(),
        ...value,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existing = customModels.find((item) => item.id === editing.id);
      if (!existing) {
        setFormErrors({ name: '模型不存在，可能已被删除' });
        return;
      }
      updateCustomModel({
        ...existing,
        ...value,
        apiKey: clearKey ? '' : value.apiKey || existing.apiKey || '',
        createdAt: existing.createdAt || now,
        updatedAt: now,
      });
    }

    closeModal();
  };

  // ============================================================
  // 测试
  // ============================================================
  const handleTest = async (kind, item) => {
    if (testingId) return;
    setTestingId(item.id);
    setTestResults((prev) => ({ ...prev, [item.id]: { state: 'testing' } }));

    const payload =
      kind === 'env'
        ? { modelId: item.id }
        : {
            modelConfig: {
              id: item.id,
              name: item.name,
              baseUrl: item.baseUrl,
              model: item.model,
              apiKey: item.apiKey || '',
            },
          };

    try {
      const res = await testModel(payload);
      if (res.success && res.data && res.data.ok) {
        setTestResults((prev) => ({
          ...prev,
          [item.id]: {
            state: 'ok',
            latencyMs: res.data.latencyMs,
            message: res.data.reply ? `返回：${res.data.reply}` : '',
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [item.id]: {
            state: 'error',
            message: res.message || '测试失败',
            latencyMs: res.data?.latencyMs,
          },
        }));
      }
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [item.id]: {
          state: 'error',
          message: (error && error.message) || '测试失败',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  // ============================================================
  // 删除
  // ============================================================
  const confirmDelete = () => {
    if (deleting) {
      deleteCustomModel(deleting.id);
      setDeleting(null);
    }
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="models-page">
      <div className="models-header">
        <button className="models-back" onClick={() => navigate('/settings')}>
          ←
        </button>
        <h1 className="models-title">模型配置</h1>
        <div className="models-header-spacer"></div>
      </div>

      <div className="models-content">
        <p className="models-intro">
          选择首页「生成模型」入口使用的模型；未选择时按环境变量配置的默认模型生成。
        </p>

        {/* 环境变量模型 */}
        <section className="model-section">
          <div className="model-section-head">
            <h2 className="model-section-title">环境变量模型</h2>
            <button
              className="models-link-btn"
              onClick={refreshModels}
              disabled={models.loading}
            >
              {models.loading ? '加载中…' : '刷新'}
            </button>
          </div>

          {models.error && (
            <div className="model-error-banner">
              <span>⚠️ {models.error}</span>
              <button className="models-link-btn" onClick={refreshModels}>
                重试
              </button>
            </div>
          )}

          {!models.loading && !models.error && envModels.length === 0 && (
            <p className="model-empty">没有获取到环境变量模型</p>
          )}

          {envModels.map((item) => {
            const result = testResults[item.id];
            const isTesting = testingId === item.id;
            return (
              <div className="model-card" key={item.id}>
                <div className="model-card-main">
                  <div className="model-card-title">
                    <span className="model-name">{item.name}</span>
                    {item.isDefault && (
                      <span className="model-badge badge-default">默认</span>
                    )}
                    <span className="model-badge badge-env">环境变量</span>
                  </div>
                  <div className="model-card-meta">
                    {item.available
                      ? item.modelPreview || '已配置'
                      : item.unavailableReason || '未配置'}
                  </div>
                  {result && (
                    <div
                      className={`model-test-result ${
                        result.state === 'ok'
                          ? 'ok'
                          : result.state === 'error'
                            ? 'error'
                            : ''
                      }`}
                    >
                      {result.state === 'testing' && '测试中…'}
                      {result.state === 'ok' &&
                        `✅ 调用成功 · ${formatLatency(result.latencyMs)}`}
                      {result.state === 'error' && `❌ ${result.message}`}
                    </div>
                  )}
                </div>
                <div className="model-card-actions">
                  <button
                    className="model-action-btn"
                    disabled={!item.available || isTesting || Boolean(testingId)}
                    onClick={() => handleTest('env', item)}
                  >
                    {isTesting ? '测试中…' : '测试'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {/* 自定义模型 */}
        <section className="model-section">
          <div className="model-section-head">
            <h2 className="model-section-title">
              自定义模型
              <span className="model-count">
                {customModels.length}/{MAX_CUSTOM_MODELS}
              </span>
            </h2>
            <button
              className="model-add-btn"
              onClick={openAdd}
              disabled={customModels.length >= MAX_CUSTOM_MODELS}
            >
              + 添加模型
            </button>
          </div>

          {customModels.length === 0 && (
            <div className="model-empty custom-empty">
              <span className="model-empty-icon">🤖</span>
              <p>还没有自定义模型</p>
              <p className="model-empty-hint">
                点击「添加模型」接入火山方舟、DeepSeek、OpenAI 等兼容接口
              </p>
            </div>
          )}

          {customModels.map((item) => {
            const result = testResults[item.id];
            const isTesting = testingId === item.id;
            return (
              <div className="model-card" key={item.id}>
                <div className="model-card-main">
                  <div className="model-card-title">
                    <span className="model-name">{item.name}</span>
                  </div>
                  <div className="model-card-meta">
                    {getHostFromUrl(item.baseUrl) || item.baseUrl} · {item.model}
                  </div>
                  {item.apiKey && (
                    <div className="model-card-key">
                      API Key：{maskApiKey(item.apiKey)}
                    </div>
                  )}
                  {result && (
                    <div
                      className={`model-test-result ${
                        result.state === 'ok'
                          ? 'ok'
                          : result.state === 'error'
                            ? 'error'
                            : ''
                      }`}
                    >
                      {result.state === 'testing' && '测试中…'}
                      {result.state === 'ok' &&
                        `✅ 调用成功 · ${formatLatency(result.latencyMs)}`}
                      {result.state === 'error' && `❌ ${result.message}`}
                    </div>
                  )}
                </div>
                <div className="model-card-actions">
                  <button
                    className="model-action-btn"
                    disabled={isTesting || Boolean(testingId)}
                    onClick={() => handleTest('custom', item)}
                  >
                    {isTesting ? '测试中…' : '测试'}
                  </button>
                  <button
                    className="model-action-btn"
                    onClick={() => openEdit(item)}
                    disabled={Boolean(testingId)}
                  >
                    编辑
                  </button>
                  <button
                    className="model-action-btn danger"
                    onClick={() => setDeleting(item)}
                    disabled={Boolean(testingId)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {/* 高级配置（预留） */}
        <section className="model-section advanced-section">
          <div className="model-section-head">
            <h2 className="model-section-title">高级配置（预留）</h2>
            <span className="model-badge badge-coming">即将支持</span>
          </div>

          <div className="advanced-row">
            <div className="advanced-info">
              <span className="advanced-name">提示词优化</span>
              <span className="advanced-desc">按结构化规则优化游戏生成提示词</span>
            </div>
            <button className="advanced-control" disabled>
              关闭
            </button>
          </div>

          <div className="advanced-row">
            <div className="advanced-info">
              <span className="advanced-name">最长提示词</span>
              <span className="advanced-desc">限制用户描述的最大长度</span>
            </div>
            <div className="advanced-control disabled-value">2000 字符</div>
          </div>

          <div className="advanced-row">
            <div className="advanced-info">
              <span className="advanced-name">最长等待时间</span>
              <span className="advanced-desc">单次生成允许的最长等待时间</span>
            </div>
            <div className="advanced-control disabled-value">300 秒</div>
          </div>

          <p className="model-note">
            以上入口仅为 V3.3 / V3.4 预留，当前不生效，也不影响生成请求。
          </p>
        </section>

        <p className="models-footer-note">
          ⚠️ 自定义模型保存在本机浏览器；API Key 仅在调用时发送给本服务，不做服务端持久化。
          请勿在公共设备保存密钥。
        </p>

        <div className="models-bottom-spacer"></div>
      </div>

      {/* 添加 / 编辑弹窗 */}
      {editing && (
        <div className="model-modal-overlay">
          <div className="model-modal">
            <h3 className="model-modal-title">
              {editing.mode === 'add' ? '添加模型' : '编辑模型'}
            </h3>

            <label className="model-form-field">
              <span className="model-form-label">显示名称</span>
              <input
                className="model-form-input"
                value={form.name}
                maxLength={30}
                placeholder="例如：我的 GLM"
                onChange={(e) => handleField('name', e.target.value)}
              />
              {formErrors.name && (
                <span className="model-form-error">{formErrors.name}</span>
              )}
            </label>

            <label className="model-form-field">
              <span className="model-form-label">接口预设</span>
              <select
                className="model-form-input"
                value={presetId}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                {MODEL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-form-field">
              <span className="model-form-label">接口地址</span>
              <input
                className="model-form-input"
                value={form.baseUrl}
                placeholder="https://.../v1/chat/completions"
                onChange={(e) => handleField('baseUrl', e.target.value)}
              />
              {formErrors.baseUrl && (
                <span className="model-form-error">{formErrors.baseUrl}</span>
              )}
            </label>

            <label className="model-form-field">
              <span className="model-form-label">模型 ID / 接入点</span>
              <input
                className="model-form-input"
                value={form.model}
                maxLength={200}
                placeholder="ep-xxxx 或模型名"
                onChange={(e) => handleField('model', e.target.value)}
              />
              {formErrors.model && (
                <span className="model-form-error">{formErrors.model}</span>
              )}
            </label>

            <label className="model-form-field">
              <span className="model-form-label">API Key（可选）</span>
              <input
                className="model-form-input"
                type="password"
                autoComplete="new-password"
                value={form.apiKey}
                maxLength={500}
                placeholder={
                  editing.mode === 'edit'
                    ? '已保存，留空则不修改'
                    : '留空则使用服务端 VOLCENGINE_API_KEY（仅火山方舟）'
                }
                onChange={(e) => handleField('apiKey', e.target.value)}
              />
              {formErrors.apiKey && (
                <span className="model-form-error">{formErrors.apiKey}</span>
              )}
            </label>

            {editing.mode === 'edit' &&
              (customModels.find((item) => item.id === editing.id)?.apiKey ||
                false) && (
                <label className="model-form-checkbox">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(e) => setClearKey(e.target.checked)}
                  />
                  清除已保存的 API Key
                </label>
              )}

            <div className="model-modal-actions">
              <button className="model-modal-btn cancel" onClick={closeModal}>
                取消
              </button>
              <button className="model-modal-btn confirm" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleting && (
        <div className="model-modal-overlay">
          <div className="model-modal">
            <h3 className="model-modal-title">确认删除模型？</h3>
            <p className="model-modal-text">
              将删除「{deleting.name}」，已保存的 API Key 也会一并移除。
            </p>
            <div className="model-modal-actions">
              <button
                className="model-modal-btn cancel"
                onClick={() => setDeleting(null)}
              >
                取消
              </button>
              <button
                className="model-modal-btn danger"
                onClick={confirmDelete}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Models;
