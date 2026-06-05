import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import { loadWorks, saveWorks, loadSettings, saveSettings } from '../services/storage';
import { DEFAULT_SETTINGS } from '../config/site';

const initialState = {
  works: [],
  settings: { ...DEFAULT_SETTINGS },
  isGenerating: false,
  generationProgress: '',
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_WORKS':
      return { ...state, works: action.payload };
    case 'ADD_WORK':
      const newWorks = [action.payload, ...state.works];
      return { ...state, works: newWorks };
    case 'DELETE_WORK':
      const filteredWorks = state.works.filter(w => w.id !== action.payload);
      return { ...state, works: filteredWorks };
    case 'INCREMENT_PLAYCOUNT':
      const updatedWorks = state.works.map(w => {
        if (w.id === action.payload) {
          return { ...w, playCount: w.playCount + 1 };
        }
        return w;
      });
      return { ...state, works: updatedWorks };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_PROGRESS':
      return { ...state, generationProgress: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext();

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 初始化数据
  useEffect(() => {
    const works = loadWorks();
    const settings = loadSettings();
    dispatch({ type: 'SET_WORKS', payload: works });
    dispatch({ type: 'SET_SETTINGS', payload: { ...DEFAULT_SETTINGS, ...settings } });
  }, []);

  // 持久化 works
  useEffect(() => {
    saveWorks(state.works);
  }, [state.works]);

  // 持久化 settings
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);

  const addWork = (work) => dispatch({ type: 'ADD_WORK', payload: work });
  const deleteWork = (id) => dispatch({ type: 'DELETE_WORK', payload: id });
  const incrementPlayCount = (id) => dispatch({ type: 'INCREMENT_PLAYCOUNT', payload: id });
  const updateSettings = (settings) => dispatch({ type: 'SET_SETTINGS', payload: settings });

  const value = useMemo(() => ({
    state,
    dispatch,
    addWork,
    deleteWork,
    incrementPlayCount,
    updateSettings,
  }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
