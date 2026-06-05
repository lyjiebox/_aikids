import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 语音识别 Hook
 * 使用浏览器 Web Speech API
 * @returns {
 *   isRecording: boolean;              // 是否正在录音
 *   transcript: string;                // 识别到的文本
 *   interimTranscript: string;         // 临时识别结果（实时显示）
 *   isSupported: boolean;              // 浏览器是否支持
 *   error: string | null;              // 错误信息
 *   startRecording: () => void;        // 开始录音
 *   stopRecording: () => void;         // 结束录音
 *   resetTranscript: () => void;       // 重置识别文本
 * }
 */
export function useSpeechRecognition() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isSupportedRef = useRef(false);

  // 检查浏览器是否支持
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      isSupportedRef.current = !!SpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN'; // 中文普通话
        recognition.continuous = true;
        recognition.interimResults = true; // 显示临时结果

        recognition.onstart = () => {
          setIsRecording(true);
          setError(null);
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }

          setInterimTranscript(interim);
          if (final) {
            setTranscript(prev => prev + final);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('语音识别错误:', event.error);
          let errorMsg = '录音出错了';
          if (event.error === 'not-allowed') {
            errorMsg = '请允许麦克风权限';
          } else if (event.error === 'no-speech') {
            errorMsg = '没有听到声音';
          }
          setError(errorMsg);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
          setInterimTranscript('');
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current && isRecording) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // 忽略
        }
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) {
      setError('您的浏览器不支持语音识别');
      return;
    }
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    try {
      recognitionRef.current.start();
    } catch (e) {
      // 可能已经在录音中
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // 忽略
      }
    }
    setIsRecording(false);
    setInterimTranscript('');
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    transcript,
    interimTranscript,
    isSupported: isSupportedRef.current,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
