/**
 * ============================================================
 * AppContext — 全局状态管理
 * ============================================================
 * 
 * 使用 React Context + useReducer 管理整个应用的状态：
 * - works: 用户创作的游戏作品列表
 * - settings: 家长设置（时长限制、内容过滤等）
 * - isGenerating: 是否正在生成游戏
 * - generationProgress: 生成进度提示文字
 * 
 * 数据持久化：
 * - 作品和设置自动保存到 localStorage
 * - 应用启动时从 localStorage 恢复数据
 * 
 * 使用方式：
 *   import { useAppContext } from '../context/AppContext';
 *   const { state, addWork, deleteWork } = useAppContext();
 */

import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef } from 'react';
import { loadWorks, saveWorks, loadSettings, saveSettings } from '../services/storage';
import { DEFAULT_SETTINGS } from '../config/site';

// ============================================================
// 初始状态
// ============================================================
const initialState = {
  works: [],
  settings: { ...DEFAULT_SETTINGS },
  isGenerating: false,
  generationProgress: '',
};

// ============================================================
// Reducer — 所有状态变更的集中处理
// ============================================================
function appReducer(state, action) {
  switch (action.type) {
    // 批量设置作品列表（初始化时使用）
    case 'SET_WORKS':
      return { ...state, works: action.payload };

    // 添加新作品到列表最前面
    case 'ADD_WORK':
      const newWorks = [action.payload, ...state.works];
      return { ...state, works: newWorks };

    // 按 ID 删除作品
    case 'DELETE_WORK':
      const filteredWorks = state.works.filter(w => w.id !== action.payload);
      return { ...state, works: filteredWorks };

    // 作品游玩次数 +1
    case 'INCREMENT_PLAYCOUNT':
      const updatedWorks = state.works.map(w => {
        if (w.id === action.payload) {
          return { ...w, playCount: w.playCount + 1 };
        }
        return w;
      });
      return { ...state, works: updatedWorks };

    // 作品被 Remix 次数 +1
    case 'INCREMENT_REMIXCOUNT':
      const remixUpdatedWorks = state.works.map(w => {
        if (w.id === action.payload) {
          return { ...w, remixCount: (w.remixCount ?? 0) + 1 };
        }
        return w;
      });
      return { ...state, works: remixUpdatedWorks };

    // 更新家长设置（部分更新，合并到现有设置）
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // 设置生成状态
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };

    // 设置生成进度文字
    case 'SET_PROGRESS':
      return { ...state, generationProgress: action.payload };

    default:
      return state;
  }
}

// ============================================================
// Context 创建
// ============================================================
const AppContext = createContext();

/**
 * AppProvider — 全局状态提供者
 * 包裹整个应用，让所有子组件都能访问全局状态
 */
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 标记是否已完成初始化加载（防止首次渲染时覆盖 localStorage）
  const initialized = useRef(false);

  // 应用启动时从 localStorage 加载数据
  useEffect(() => {
    const works = loadWorks();
    const settings = loadSettings();
    dispatch({ type: 'SET_WORKS', payload: works });
    dispatch({ type: 'SET_SETTINGS', payload: { ...DEFAULT_SETTINGS, ...settings } });
    initialized.current = true; // 标记初始化完成
  }, []);

  // 作品变更时自动保存到 localStorage（跳过初始化阶段）
  useEffect(() => {
    if (initialized.current) {
      saveWorks(state.works);
    }
  }, [state.works]);

  // 设置变更时自动保存到 localStorage（跳过初始化阶段）
  useEffect(() => {
    if (initialized.current) {
      saveSettings(state.settings);
    }
  }, [state.settings]);

  // ============================================================
  // 对外暴露的操作方法
  // ============================================================
  const addWork = (work) => dispatch({ type: 'ADD_WORK', payload: work });
  const deleteWork = (id) => dispatch({ type: 'DELETE_WORK', payload: id });
  const incrementPlayCount = (id) => dispatch({ type: 'INCREMENT_PLAYCOUNT', payload: id });
  const incrementRemixCount = (id) => dispatch({ type: 'INCREMENT_REMIXCOUNT', payload: id });
  const updateSettings = (settings) => dispatch({ type: 'SET_SETTINGS', payload: settings });

  // 用 useMemo 缓存 context value，避免不必要的重渲染
  const value = useMemo(() => ({
    state,
    dispatch,
    addWork,
    deleteWork,
    incrementPlayCount,
    incrementRemixCount,
    updateSettings,
  }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * useAppContext — 在组件中获取全局状态的 Hook
 * 
 * 用法：
 *   const { state, addWork, deleteWork } = useAppContext();
 *   console.log(state.works); // 所有作品
 */
export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
