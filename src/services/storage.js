const WORKS_KEY = "aikids-works";
const SETTINGS_KEY = "aikids-settings";

export function loadWorks() {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[storage] loadWorks failed:", e);
    return [];
  }
}

export function saveWorks(works) {
  try {
    localStorage.setItem(WORKS_KEY, JSON.stringify(works));
  } catch (e) {
    console.error("[storage] saveWorks failed:", e);
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("[storage] loadSettings failed:", e);
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("[storage] saveSettings failed:", e);
  }
}
