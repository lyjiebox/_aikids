import React, { createContext, useReducer, useEffect, useMemo } from "react";
import type { GameWork, ParentSettings, AppState } from "../types";
import {
  loadWorks,
  saveWorks,
  loadSettings,
  saveSettings,
  loadDailyUsage,
  saveDailyUsage,
  loadSessionStart,
  saveSessionStart,
} from "../services/storage";

type Action =
  | { type: "SET_WORKS"; payload: GameWork[] }
  | { type: "ADD_WORK"; payload: GameWork }
  | { type: "DELETE_WORK"; payload: string }
  | { type: "INCREMENT_PLAYCOUNT"; payload: string }
  | { type: "SET_SETTINGS"; payload: ParentSettings }
  | { type: "SET_GENERATING"; payload: boolean }
  | { type: "SET_PROGRESS"; payload: string }
  | { type: "SET_CURRENTPAGE"; payload: string };

const initialState: AppState = {
  works: [],
  settings: {
    dailyTimeLimit: 30,
    sessionTimeLimit: 20,
    allowVoiceInput: true,
    contentFilterLevel: "strict",
  },
  currentPage: "pages/index/index",
  isGenerating: false,
  generationProgress: "",
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_WORKS":
      return { ...state, works: action.payload };
    case "ADD_WORK": {
      const newWorks = [action.payload, ...state.works];
      return { ...state, works: newWorks };
    }
    case "DELETE_WORK": {
      const newWorks = state.works.filter((w) => w.id !== action.payload);
      return { ...state, works: newWorks };
    }
    case "INCREMENT_PLAYCOUNT": {
      const newWorks = state.works.map((w) => {
        if (w.id === action.payload) {
          return { ...w, playCount: w.playCount + 1 };
        }
        return w;
      });
      return { ...state, works: newWorks };
    }
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_GENERATING":
      return { ...state, isGenerating: action.payload };
    case "SET_PROGRESS":
      return { ...state, generationProgress: action.payload };
    case "SET_CURRENTPAGE":
      return { ...state, currentPage: action.payload };
    default:
      return state;
  }
}

type AppContextType = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  addWork: (work: GameWork) => void;
  deleteWork: (id: string) => void;
  incrementPlayCount: (id: string) => void;
  updateSettings: (settings: Partial<ParentSettings>) => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 初始化数据
  useEffect(() => {
    const works = loadWorks();
    const settings = loadSettings();
    dispatch({ type: "SET_WORKS", payload: works });
    dispatch({ type: "SET_SETTINGS", payload: settings });

    // 确保 sessionStart 存在
    const sessionStart = loadSessionStart();
    if (!sessionStart) {
      saveSessionStart(Date.now());
    }
  }, []);

  // 持久化 works
  useEffect(() => {
    if (state.works.length > 0 || loadWorks().length > 0) {
      saveWorks(state.works);
    }
  }, [state.works]);

  // 持久化 settings
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);

  // 常用方法
  const addWork = (work: GameWork) => {
    dispatch({ type: "ADD_WORK", payload: work });
  };

  const deleteWork = (id: string) => {
    dispatch({ type: "DELETE_WORK", payload: id });
  };

  const incrementPlayCount = (id: string) => {
    dispatch({ type: "INCREMENT_PLAYCOUNT", payload: id });
  };

  const updateSettings = (settings: Partial<ParentSettings>) => {
    dispatch({
      type: "SET_SETTINGS",
      payload: { ...state.settings, ...settings },
    });
  };

  const value = useMemo(
    () => ({
      state,
      dispatch,
      addWork,
      deleteWork,
      incrementPlayCount,
      updateSettings,
    }),
    [state]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppContext(): AppContextType {
  const ctx = React.useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return ctx;
}
