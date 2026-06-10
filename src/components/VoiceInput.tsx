/**
 * ============================================================
 * VoiceInput 组件 — 语音输入 + 文字输入降级
 * ============================================================
 * 
 * 功能：
 * - 按住麦克风按钮开始录音，松开结束
 * - 实时显示语音识别中间结果（绿色文字）
 * - 录音结束后自动填入识别文本
 * - 支持手动修改识别结果
 * - 浏览器不支持语音时自动降级为纯文字输入
 * 
 * 依赖：
 * - useSpeechRecognition Hook（Web Speech API）
 * 
 * 使用方式：
 *   <VoiceInput value={text} onChange={setText} />
 */

import React from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import './VoiceInput.css';

type VoiceInputProps = {
  value: string;           // 当前输入文本（受控组件）
  onChange: (value: string) => void;  // 文本变更回调
};

export function VoiceInput({ value, onChange }: VoiceInputProps) {
  const {
    isRecording,         // 是否正在录音
    transcript,          // 最终识别文本
    interimTranscript,   // 临时识别文本（实时显示）
    isSupported,         // 浏览器是否支持语音识别
    error,               // 错误信息
    startRecording,      // 开始录音
    stopRecording,       // 结束录音
    resetTranscript,     // 重置识别文本
  } = useSpeechRecognition();

  // 录音结束时，将识别结果同步到外部状态
  React.useEffect(() => {
    if (!isRecording && transcript) {
      onChange(transcript);
      resetTranscript();
    }
  }, [isRecording, transcript, onChange, resetTranscript]);

  // ============================================================
  // 浏览器不支持语音识别 → 降级为纯文字输入
  // ============================================================
  if (!isSupported) {
    return (
      <div className="voice-input-container">
        {/* 麦克风按钮（禁用状态） */}
        <div
          className="mic-button"
          style={{ opacity: 0.5, cursor: 'not-allowed' }}
          title="您的浏览器不支持语音识别"
        >
          <span className="mic-icon">🎤</span>
        </div>

        {/* 不支持提示 */}
        <div className="error-text">
          ⚠️ 您的浏览器不支持语音识别，请使用 Chrome/Edge 浏览器
        </div>

        {/* 文字输入框（降级方案） */}
        <textarea
          className="text-input-large"
          placeholder="在这里输入你的游戏创意..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      </div>
    );
  }

  // ============================================================
  // 正常模式：语音 + 文字双输入
  // ============================================================
  return (
    <div className="voice-input-container">
      {/* 麦克风按钮：按住说话，松开结束 */}
      <div
        className={`mic-button ${isRecording ? 'recording' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}     {/* 鼠标移出也停止（防止卡录音） */}
        onTouchStart={startRecording}     {/* 移动端触摸支持 */}
        onTouchEnd={stopRecording}
      >
        {isRecording ? (
          <>
            {/* 录音中的脉冲动画 */}
            <div className="mic-animation">
              <div className="mic-pulse"></div>
              <div className="mic-pulse"></div>
              <div className="mic-pulse"></div>
            </div>
            <span className="mic-icon">🎤</span>
          </>
        ) : (
          <span className="mic-icon">🎤</span>
        )}
      </div>

      {/* 状态提示 */}
      <div className="voice-hint">
        {isRecording ? (
          <div className="recording-hint">
            <span className="recording-dot"></span>
            正在听...
          </div>
        ) : (
          <span className="hint-text">按住麦克风说话，松开结束</span>
        )}
      </div>

      {/* 实时识别文本（绿色，录音中显示） */}
      {interimTranscript && (
        <div className="interim-text">{interimTranscript}</div>
      )}

      {/* 错误提示 */}
      {error && <div className="error-text">{error}</div>}

      {/* 文字输入框：有内容时显示，可以手动修改识别结果 */}
      {value && (
        <textarea
          className="text-input-large"
          placeholder="可以修改一下你的创意..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      )}

      {/* 文字输入框：无内容时也显示，作为语音的替代方案 */}
      {!value && (
        <>
          <div className="text-input-toggle">
            <span className="toggle-hint">或者直接输入文字</span>
          </div>
          <textarea
            className="text-input-large"
            placeholder="在这里输入你的游戏创意..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        </>
      )}
    </div>
  );
}
