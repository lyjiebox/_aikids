import { useState, useCallback } from "react";
import { useAppContext } from "../context/AppContext";
import { generateGame } from "../services/api";
import type { GameWork } from "../types";
import Taro from "@tarojs/taro";

export function useGameGenerator() {
  const { state, dispatch, addWork } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (params: { templateId?: string; userPrompt: string }) => {
      if (!params.userPrompt.trim()) {
        setError("请先说出你的创意");
        Taro.showToast({ title: "请先说出你的创意", icon: "none" });
        return null;
      }

      dispatch({ type: "SET_GENERATING", payload: true });
      dispatch({ type: "SET_PROGRESS", payload: "正在生成魔法游戏..." });
      setError(null);

      try {
        const res = await generateGame(params);

        if (res.success && res.data) {
          const work: GameWork = {
            id: Date.now().toString(),
            title: res.data.title || "我的游戏",
            templateId: params.templateId || "free",
            userPrompt: params.userPrompt,
            gameHtml: res.data.gameHtml,
            createdAt: Date.now(),
            playCount: 0,
          };
          addWork(work);
          dispatch({ type: "SET_PROGRESS", payload: "生成成功！" });
          return work;
        } else {
          const msg = res.message || "生成失败";
          setError(msg);
          Taro.showToast({ title: msg, icon: "none" });
          return null;
        }
      } catch (e) {
        console.error("[useGameGenerator] error:", e);
        const msg = "魔法好像失灵了，再试一次吧！";
        setError(msg);
        Taro.showToast({ title: msg, icon: "none" });
        return null;
      } finally {
        dispatch({ type: "SET_GENERATING", payload: false });
      }
    },
    [dispatch, addWork]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isGenerating: state.isGenerating,
    progress: state.generationProgress,
    error,
    generate,
    clearError,
  };
}
