/**
 * ============================================================
 * AppContext — 全局状态管理
 * ============================================================
 *
 * 使用 React Context + useReducer 管理整个应用的状态：
 * - works: 用户创作的游戏作品列表
 * - settings: 家长设置（时长限制、内容过滤等）
 * - models: 模型状态（内置模型 + 自定义模型 + 默认模型）
 * - selectedModelId: 当前会话选择的模型（null = 环境变量）
 * - isGenerating: 是否正在生成游戏
 * - generationProgress: 生成进度提示文字
 *
 * 数据持久化：
 * - 作品、设置、自定义模型自动保存到 localStorage
 * - 当前模型选择保存到 sessionStorage（新会话回到环境变量）
 * - 应用启动时从存储恢复数据
 *
 * 使用方式：
 *   import { useAppContext } from '../context/AppContext';
 *   const { state, addWork, deleteWork, selectModel } = useAppContext();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  loadWorks,
  saveWorks,
  loadSettings,
  saveSettings,
  loadCustomModels,
  saveCustomModels,
} from '../services/storage';
import { fetchModelCatalog } from '../services/api';
import {
  loadSelectedModelId,
  saveSelectedModelId,
  MAX_CUSTOM_MODELS,
} from '../services/model-utils';
import { DEFAULT_SETTINGS } from '../config/site';

// ============================================================
// 初始状态
// ============================================================
const initialModelsState = {
  custom: [],
  env: [],
  defaultModelId: null,
  defaultModelName: null,
  hasServerApiKey: false,
  loading: true,
  error: null,
  initialized: false,
};

const initialState = {
  works: [],
  settings: { ...DEFAULT_SETTINGS },
  models: { ...initialModelsState },
  selectedModelId: null,
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
      return { ...state, works: [action.payload, ...state.works] };

    // 按 ID 删除作品
    case 'DELETE_WORK':
      return {
        ...state,
        works: state.works.filter((w) => w.id !== action.payload),
      };

    // 作品游玩次数 +1
    case 'INCREMENT_PLAYCOUNT':
      return {
        ...state,
        works: state.works.map((w) =>
          w.id === action.payload ? { ...w, playCount: w.playCount + 1 } : w
        ),
      };

    // 作品被 Remix 次数 +1
    case 'INCREMENT_REMIXCOUNT':
      return {
        ...state,
        works: state.works.map((w) =>
          w.id === action.payload
            ? { ...w, remixCount: (w.remixCount ?? 0) + 1 }
            : w
        ),
      };

    // 更新家长设置（部分更新，合并到现有设置）
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // 设置生成状态
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };

    // 设置生成进度文字
    case 'SET_PROGRESS':
      return { ...state, generationProgress: action.payload };

    // ========================================================
    // V3.2 模型状态
    // ========================================================

    // 初始化：恢复自定义模型与当前选择（此时内置模型尚未返回）
    case 'INIT_MODELS':
      return {
        ...state,
        models: {
          ...state.models,
          custom: action.payload.custom,
          initialized: true,
          loading: true,
        },
        selectedModelId: action.payload.selectedModelId ?? null,
      };

    // 合并模型子状态（内置模型加载、刷新、错误）
    case 'SET_MODEL_STATE':
      return {
        ...state,
        models: { ...state.models, ...action.payload },
      };

    // 添加自定义模型（最多 20 个）
    case 'ADD_CUSTOM_MODEL': {
      if (state.models.custom.length >= MAX_CUSTOM_MODELS) return state;
      return {
        ...state,
        models: {
          ...state.models,
          custom: [...state.models.custom, action.payload],
        },
      };
    }

    // 更新自定义模型
    case 'UPDATE_CUSTOM_MODEL':
      return {
        ...state,
        models: {
          ...state.models,
          custom: state.models.custom.map((item) =>
            item.id === action.payload.id ? action.payload : item
          ),
        },
      };

    // 删除自定义模型；若删除的是当前选择，回退到环境变量
    case 'DELETE_CUSTOM_MODEL':
      return {
        ...state,
        models: {
          ...state.models,
          custom: state.models.custom.filter(
            (item) => item.id !== action.payload
          ),
        },
        selectedModelId:
          state.selectedModelId === action.payload
            ? null
            : state.selectedModelId,
      };

    // 设置当前模型选择
    case 'SET_SELECTED_MODEL':
      return {
        ...state,
        selectedModelId: action.payload || null,
      };

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

  // 是否已从 localStorage 完成水合。
  // 必须用 state 而不是 ref：React StrictMode 会重复执行 effect，
  // 用 ref 会在第二次初始化前被首次保存副作用清空 localStorage。
  const [hydrated, setHydrated] = useState(false);

  // 应用启动时从 localStorage 加载数据
  useEffect(() => {
    const works = loadWorks();
    const settings = loadSettings();
    const customModels = loadCustomModels();
    const selectedModelId = loadSelectedModelId();

    dispatch({ type: 'SET_WORKS', payload: works });
    dispatch({ type: 'SET_SETTINGS', payload: { ...DEFAULT_SETTINGS, ...settings } });
    dispatch({
      type: 'INIT_MODELS',
      payload: { custom: customModels, selectedModelId },
    });
    setHydrated(true); // 标记初始化完成
  }, []);

  // 作品变更时自动保存到 localStorage（水合完成后再写入）
  useEffect(() => {
    if (hydrated) {
      saveWorks(state.works);
    }
  }, [state.works, hydrated]);

  // 设置变更时自动保存到 localStorage（水合完成后再写入）
  useEffect(() => {
    if (hydrated) {
      saveSettings(state.settings);
    }
  }, [state.settings, hydrated]);

  // 自定义模型变更时自动保存（初始化完成后再写入）
  useEffect(() => {
    if (state.models.initialized) {
      saveCustomModels(state.models.custom);
    }
  }, [state.models.custom, state.models.initialized]);

  // 当前模型选择保存到 sessionStorage
  useEffect(() => {
    if (state.models.initialized) {
      saveSelectedModelId(state.selectedModelId);
    }
  }, [state.selectedModelId, state.models.initialized]);

  // 拉取内置模型目录
  const refreshModels = useCallback(async () => {
    dispatch({ type: 'SET_MODEL_STATE', payload: { loading: true, error: null } });
    try {
      const res = await fetchModelCatalog();
      const data = res?.data || {};
      dispatch({
        type: 'SET_MODEL_STATE',
        payload: {
          env: Array.isArray(data.models) ? data.models : [],
          defaultModelId: data.defaultModelId ?? null,
          defaultModelName: data.defaultModelName ?? null,
          hasServerApiKey: Boolean(data.hasServerApiKey),
          loading: false,
          error: null,
        },
      });
    } catch (error) {
      dispatch({
        type: 'SET_MODEL_STATE',
        payload: {
          loading: false,
          error:
            (error && error.message) || '无法获取环境模型配置，请稍后重试',
        },
      });
    }
  }, []);

  // 启动时拉取内置模型
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  // 校验当前选择：模型被删除/不可用时回退到环境变量
  useEffect(() => {
    const { models, selectedModelId } = state;
    if (!models.initialized) return;
    // 内置模型仍在加载或加载失败时先不判断，避免误清空
    if (models.loading || models.error) return;
    if (!selectedModelId) return;

    const customExists = models.custom.some(
      (item) => item.id === selectedModelId
    );
    const envExists = models.env.some(
      (item) => item.id === selectedModelId && item.available
    );

    if (!customExists && !envExists) {
      dispatch({ type: 'SET_SELECTED_MODEL', payload: null });
    }
  }, [
    state.models.initialized,
    state.models.loading,
    state.models.error,
    state.models.custom,
    state.models.env,
    state.selectedModelId,
  ]);

  // ============================================================
  // 对外暴露的操作方法
  // ============================================================
  const addWork = useCallback(
    (work) => dispatch({ type: 'ADD_WORK', payload: work }),
    []
  );
  const deleteWork = useCallback(
    (id) => dispatch({ type: 'DELETE_WORK', payload: id }),
    []
  );
  const incrementPlayCount = useCallback(
    (id) => dispatch({ type: 'INCREMENT_PLAYCOUNT', payload: id }),
    []
  );
  const incrementRemixCount = useCallback(
    (id) => dispatch({ type: 'INCREMENT_REMIXCOUNT', payload: id }),
    []
  );
  const updateSettings = useCallback(
    (settings) => dispatch({ type: 'SET_SETTINGS', payload: settings }),
    []
  );

  const addCustomModel = useCallback(
    (model) => dispatch({ type: 'ADD_CUSTOM_MODEL', payload: model }),
    []
  );
  const updateCustomModel = useCallback(
    (model) => dispatch({ type: 'UPDATE_CUSTOM_MODEL', payload: model }),
    []
  );
  const deleteCustomModel = useCallback(
    (id) => dispatch({ type: 'DELETE_CUSTOM_MODEL', payload: id }),
    []
  );
  const selectModel = useCallback(
    (id) => dispatch({ type: 'SET_SELECTED_MODEL', payload: id || null }),
    []
  );

  // 用 useMemo 缓存 context value，避免不必要的重渲染
  const value = useMemo(
    () => ({
      state,
      dispatch,
      addWork,
      deleteWork,
      incrementPlayCount,
      incrementRemixCount,
      updateSettings,
      addCustomModel,
      updateCustomModel,
      deleteCustomModel,
      selectModel,
      refreshModels,
    }),
    [
      state,
      addWork,
      deleteWork,
      incrementPlayCount,
      incrementRemixCount,
      updateSettings,
      addCustomModel,
      updateCustomModel,
      deleteCustomModel,
      selectModel,
      refreshModels,
    ]
  );

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
