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

  // 如果不支持语音识别，显示纯文本输入框
  if (!isSupported) {
    return (
      <div className="voice-input-container">
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
