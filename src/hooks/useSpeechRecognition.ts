/**
 * ============================================================
 * useSpeechRecognition — 浏览器语音识别 Hook
 * ============================================================
 * 
 * 基于浏览器 Web Speech API 实现语音转文字功能。
 * 
 * 支持：
 * - 中文普通话识别（zh-CN）
 * - 实时显示临时识别结果（绿色文字）
 * - 录音结束后返回完整识别文本
 * - 浏览器不支持时自动降级
 * 
 * 限制：
 * - 仅 Chrome/Edge 完整支持
 * - Safari/Firefox 支持有限或不支持
 * - 需要 HTTPS 或 localhost（浏览器安全策略）
 * 
 * 使用方式：
 *   const { isRecording, transcript, startRecording, stopRecording } = useSpeechRecognition();
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export function useSpeechRecognition() {
  // ============================================================
  // 状态
  // ============================================================
  const [isRecording, setIsRecording] = useState(false);           // 是否正在录音
  const [transcript, setTranscript] = useState('');                // 最终识别文本
  const [interimTranscript, setInterimTranscript] = useState('');  // 临时识别文本
  const [error, setError] = useState<string | null>(null);         // 错误信息

  // ============================================================
  // Refs（不需要触发重渲染的值用 ref）
  // ============================================================
  const recognitionRef = useRef<any>(null);       // SpeechRecognition 实例
  const [isSupported, setIsSupported] = useState(false);    // 浏览器是否支持语音识别（state 触发重渲染）
  const isRecordingRef = useRef(false);            // 录音状态（用于 cleanup）

  // ============================================================
  // 初始化 SpeechRecognition
  // ============================================================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 兼容 Chrome（webkitSpeechRecognition）和标准 API
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setIsSupported(!!SpeechRecognition);

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';           // 中文普通话
        recognition.continuous = true;         // 持续识别（不自动停止）
        recognition.interimResults = true;     // 返回临时结果

        // 录音开始
        recognition.onstart = () => {
          setIsRecording(true);
          isRecordingRef.current = true;
          setError(null);
        };

        // 识别结果（包含临时和最终结果）
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

        // 识别错误
        recognition.onerror = (event: any) => {
          console.error('语音识别错误:', event.error);
          let errorMsg = '录音出错了';
          if (event.error === 'not-allowed') {
            errorMsg = '请允许麦克风权限';
          } else if (event.error === 'no-speech') {
            errorMsg = '没有听到声音，请再试一次';
          } else if (event.error === 'network') {
            errorMsg = '网络连接失败，请检查网络';
          }
          setError(errorMsg);
          setIsRecording(false);
          isRecordingRef.current = false;
        };

        // 录音结束
        recognition.onend = () => {
          setIsRecording(false);
          isRecordingRef.current = false;
          setInterimTranscript('');
        };

        recognitionRef.current = recognition;
      }
    }

    // 组件卸载时停止录音
    return () => {
      if (recognitionRef.current && isRecordingRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // 忽略（可能已经停止了）
        }
      }
    };
  }, []); // 只在挂载时初始化一次

  // ============================================================
  // 操作方法
  // ============================================================

  /** 开始录音 */
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
      // 可能已经在录音中，忽略
    }
  }, []);

  /** 结束录音 */
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // 忽略
      }
    }
    setIsRecording(false);
    isRecordingRef.current = false;
    setInterimTranscript('');
  }, []);

  /** 重置识别文本 */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
