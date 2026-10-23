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
 * - 数据备份 / 导入（V3.6，含自定义模型 API Key）
 * - 本地诊断日志（V3.6，只存本机）
 * - 清空所有作品
 */

import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getCurrentModelLabel } from '../services/model-utils';
import {
  buildTelemetryFilename,
  createBackupFile,
  downloadJsonFile,
  readBackupFile,
} from '../services/backup';
import { mergeSnapshots } from '../services/storage-schema';
import {
  buildTelemetryExport,
  clearTelemetryEvents,
  getTelemetryCount,
  recordTelemetryEvent,
} from '../services/telemetry';
import ParentGate from '../components/ParentGate';
import './Settings.css';

/**
 * Settings — 家长设置页
 */
function Settings() {
  const { state, updateSettings, dispatch, importSnapshot } = useAppContext();
  // 同一会话内已验证过则不重复验证
  const [authenticated, setAuthenticated] = useState(() => {
    try {
      return sessionStorage.getItem('aikids-parent-verified') === '1';
    } catch {
      return false;
    }
  });

  const fileInputRef = useRef(null);
  const [backupMessage, setBackupMessage] = useState(null); // { type, text }
  const [pendingImport, setPendingImport] = useState(null); // readBackupFile 结果
  const [telemetryCount, setTelemetryCount] = useState(() => getTelemetryCount());

  const handlePass = () => {
    try {
      sessionStorage.setItem('aikids-parent-verified', '1');
    } catch {
      // 忽略存储失败
    }
    setAuthenticated(true);
  };

  // 导出源使用当前内存 state，保证刚生成的作品也在备份里
  const currentSnapshot = () => ({
    works: state.works,
    settings: state.settings,
    models: state.models.custom,
  });

  const handleExport = () => {
    const file = createBackupFile(currentSnapshot());
    const downloaded = downloadJsonFile(file.filename, file.json);
    if (downloaded) {
      setBackupMessage({
        type: 'ok',
        text: `已导出 ${file.counts.works} 个作品、${file.counts.models} 个模型（含模型 API Key，请妥善保管）`,
      });
    } else {
      setBackupMessage({ type: 'error', text: '导出失败，请稍后重试' });
      recordTelemetryEvent('failure', {
        scope: 'storage',
        code: 'EXPORT_FAILED',
        message: '备份下载失败',
      });
      setTelemetryCount(getTelemetryCount());
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    // 允许连续选择同一个文件
    event.target.value = '';
    if (!file) return;

    const result = await readBackupFile(file);
    if (!result.ok) {
      setBackupMessage({ type: 'error', text: result.message });
      recordTelemetryEvent('failure', {
        scope: 'import',
        code: result.code,
        message: result.message,
      });
      setTelemetryCount(getTelemetryCount());
      return;
    }

    setPendingImport(result);
  };

  const applyImport = (mode) => {
    if (!pendingImport) return;

    const { snapshot, summary } = mergeSnapshots(
      currentSnapshot(),
      pendingImport.snapshot,
      mode
    );
    importSnapshot(snapshot);
    setPendingImport(null);
    setBackupMessage({
      type: 'ok',
      text:
        mode === 'replace'
          ? `已覆盖导入：${summary.totalWorks} 个作品、${summary.totalModels} 个模型`
          : `已合并导入：新增 ${summary.worksAdded} 个作品、${summary.modelsAdded} 个模型；跳过 ${summary.worksSkipped} 个重复作品、${summary.modelsSkipped} 个重复模型`,
    });
  };

  const handleReplaceImport = () => {
    if (
      !confirm(
        '覆盖导入会替换现有的全部作品、设置和自定义模型。建议先导出备份，确认继续吗？'
      )
    ) {
      return;
    }
    applyImport('replace');
  };

  const handleExportTelemetry = () => {
    const payload = buildTelemetryExport();
    const downloaded = downloadJsonFile(
      buildTelemetryFilename(),
      JSON.stringify(payload, null, 2)
    );
    setBackupMessage(
      downloaded
        ? { type: 'ok', text: `已导出 ${payload.events.length} 条本地诊断日志` }
        : { type: 'error', text: '诊断日志导出失败，请稍后重试' }
    );
  };

  const handleClearTelemetry = () => {
    if (!confirm('确认清空本地诊断日志吗？此操作不可恢复。')) return;
    clearTelemetryEvents();
    setTelemetryCount(0);
    setBackupMessage({ type: 'ok', text: '本地诊断日志已清空' });
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

        {/* V3.6：数据备份与诊断日志（不上传服务端） */}
        <div className="backup-section">
          <h2 className="backup-title">数据备份</h2>
          <p className="backup-warning">
            ⚠️ 备份文件包含自定义模型的 API Key，请只保存在自己的设备上，不要发给别人。
          </p>

          <div className="backup-actions">
            <button type="button" className="backup-btn primary" onClick={handleExport}>
              📦 导出全部数据
            </button>
            <button
              type="button"
              className="backup-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📥 导入备份文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="backup-file-input"
              onChange={handleFileChange}
            />
          </div>

          {backupMessage && (
            <p
              role="alert"
              className={`backup-message ${backupMessage.type}`}
            >
              {backupMessage.text}
            </p>
          )}

          <div className="backup-telemetry">
            <div className="setting-label">
              <span className="label-text">本地诊断日志</span>
              <span className="label-value">{telemetryCount} 条</span>
            </div>
            <div className="backup-actions">
              <button
                type="button"
                className="backup-btn small"
                onClick={handleExportTelemetry}
                disabled={telemetryCount === 0}
              >
                导出日志
              </button>
              <button
                type="button"
                className="backup-btn small danger"
                onClick={handleClearTelemetry}
                disabled={telemetryCount === 0}
              >
                清空日志
              </button>
            </div>
            <p className="backup-hint">
              只保存在本机，不上传服务器；不包含游戏内容、Prompt 或 API Key。
            </p>
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

      {/* 导入确认弹窗：合并 / 覆盖 / 取消 */}
      {pendingImport && (
        <div className="backup-modal-overlay">
          <div className="backup-modal">
            <h3 className="backup-modal-title">导入备份</h3>
            {pendingImport.filename && (
              <p className="backup-modal-file">{pendingImport.filename}</p>
            )}
            <p className="backup-modal-summary">
              文件包含 {pendingImport.snapshot.works.length} 个作品、
              {pendingImport.snapshot.models.length} 个自定义模型
              {pendingImport.meta.exportedAt
                ? `，导出于 ${new Date(pendingImport.meta.exportedAt).toLocaleString('zh-CN')}`
                : ''}
            </p>
            <p className="backup-modal-hint">
              合并导入保留现有数据并跳过重复项；覆盖导入会替换全部作品、设置和模型。
            </p>
            <div className="backup-modal-buttons">
              <button
                type="button"
                className="backup-btn cancel"
                onClick={() => setPendingImport(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="backup-btn primary"
                onClick={() => applyImport('merge')}
              >
                合并导入
              </button>
              <button
                type="button"
                className="backup-btn danger"
                onClick={handleReplaceImport}
              >
                覆盖导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
