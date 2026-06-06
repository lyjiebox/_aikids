import React from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import './VoiceInput.css';

type VoiceInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function VoiceInput({ value, onChange }: VoiceInputProps) {
  const {
    isRecording,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
  } = useSpeechRecognition();

  // 录音结束时，更新外部状态
  React.useEffect(() => {
    if (!isRecording && transcript) {
      onChange(transcript);
      resetTranscript();
    }
  }, [isRecording, transcript, onChange, resetTranscript]);

  // 调试信息
  React.useEffect(() => {
    console.log('🎤 VoiceInput: isSupported =', isSupported);
    console.log('🎤 VoiceInput: window.SpeechRecognition =', typeof window !== 'undefined' && (window as any).SpeechRecognition);
    console.log('🎤 VoiceInput: window.webkitSpeechRecognition =', typeof window !== 'undefined' && (window as any).webkitSpeechRecognition);
  }, [isSupported]);

  // 如果不支持语音识别，仍然显示界面，但给出提示
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

        {/* 文本输入框 */}
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

  return (
    <div className="voice-input-container">
      {/* 麦克风按钮 */}
      <div
        className={`mic-button ${isRecording ? 'recording' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
      >
        {isRecording ? (
          <>
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

      {/* 提示文字 */}
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

      {/* 实时文本显示 */}
      {interimTranscript && (
        <div className="interim-text">{interimTranscript}</div>
      )}

      {/* 错误提示 */}
      {error && <div className="error-text">{error}</div>}

      {/* 已有内容时，显示文本输入框 */}
      {value && (
        <textarea
          className="text-input-large"
          placeholder="可以修改一下你的创意..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      )}

      {/* 降级选项：也提供文字输入 */}
      <div className="text-input-toggle">
        {!value && (
          <span className="toggle-hint">或者直接输入文字</span>
        )}
      </div>
      {!value && (
        <textarea
          className="text-input-large"
          placeholder="在这里输入你的游戏创意..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )}
    </div>
  );
}
