import Taro from "@tarojs/taro";
import type { GameWork, ParentSettings } from "../types";
import { DEFAULT_SETTINGS } from "../config/site.config";

const WORKS_KEY = "aikids:works";
const SETTINGS_KEY = "aikids:settings";
const DAILY_USAGE_KEY = "aikids:dailyUsage";
const SESSION_START_KEY = "aikids:sessionStart";

export function loadWorks(): GameWork[] {
  try {
    const raw = Taro.getStorageSync(WORKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[storage] loadWorks failed:", e);
    return [];
  }
}

export function saveWorks(works: GameWork[]): void {
  try {
    Taro.setStorageSync(WORKS_KEY, JSON.stringify(works));
  } catch (e) {
    console.error("[storage] saveWorks failed:", e);
  }
}

export function loadSettings(): ParentSettings {
  try {
    const raw = Taro.getStorageSync(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.error("[storage] loadSettings failed:", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ParentSettings): void {
  try {
    Taro.setStorageSync(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("[storage] saveSettings failed:", e);
  }
}

export function loadDailyUsage(): {
  date: string;
  usedMinutes: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = Taro.getStorageSync(DAILY_USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today) {
        return parsed;
      }
    }
    return { date: today, usedMinutes: 0 };
  } catch (e) {
    return { date: today, usedMinutes: 0 };
  }
}

export function saveDailyUsage(usage: {
  date: string;
  usedMinutes: number;
}): void {
  try {
    Taro.setStorageSync(DAILY_USAGE_KEY, JSON.stringify(usage));
  } catch (e) {
    console.error("[storage] saveDailyUsage failed:", e);
  }
}

export function loadSessionStart(): number {
  try {
    const raw = Taro.getStorageSync(SESSION_START_KEY);
    return raw ? Number(raw) : Date.now();
  } catch (e) {
    return Date.now();
  }
}

export function saveSessionStart(time: number): void {
  try {
    Taro.setStorageSync(SESSION_START_KEY, String(time));
  } catch (e) {
    console.error("[storage] saveSessionStart failed:", e);
  }
}
