import { useState, useCallback, useRef, useEffect } from "react";
import Taro from "@tarojs/taro";

export function useSpeechRecognition(options?: {
  onResult?: (text: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const recognitionRef = useRef<any>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // 检测是否支持 Web Speech API（仅 H5）
    if (process.env.TARO_ENV === "h5") {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SR) {
        setSupported(true);
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (process.env.TARO_ENV !== "h5") {
      Taro.showToast({ title: "语音输入仅在 H5 可用", icon: "none" });
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText("");
      setFinalText("");
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setFinalText(transcript);
          if (options?.onResult) {
            options.onResult(transcript);
          }
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (e: any) => {
      console.error("[speech] error:", e);
      setIsListening(false);
      Taro.showToast({ title: "语音识别失败", icon: "none" });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [options]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  return {
    supported,
    isListening,
    interimText,
    finalText,
    startListening,
    stopListening,
  };
}
