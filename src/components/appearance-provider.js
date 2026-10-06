"use client";

import { createContext, useContext, useEffect, useState } from "react";

const storageKey = "tribe-appearance";
const colorModes = new Set(["light", "dark", "system"]);
const uiStyles = new Set(["glass", "clay", "skeuomorphic", "neumorphic"]);
const defaults = {
  colorMode: "light",
  uiStyle: "glass",
  compact: false,
  reduceMotion: false,
};
const AppearanceContext = createContext(null);

function normalizeSettings(value = {}) {
  return {
    colorMode: colorModes.has(value.colorMode) ? value.colorMode : defaults.colorMode,
    uiStyle: uiStyles.has(value.uiStyle) ? value.uiStyle : defaults.uiStyle,
    compact: Boolean(value.compact),
    reduceMotion: Boolean(value.reduceMotion),
  };
}

function applyAppearance(settings) {
  const root = document.documentElement;
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.colorMode = settings.colorMode === "system"
    ? systemPrefersDark ? "dark" : "light"
    : settings.colorMode;
  root.dataset.modeChoice = settings.colorMode;
  root.dataset.uiTheme = settings.uiStyle;
  root.dataset.density = settings.compact ? "compact" : "comfortable";
  root.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
}

export function AppearanceProvider({ children }) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let restored = defaults;
    try {
      restored = normalizeSettings(JSON.parse(localStorage.getItem(storageKey) || "{}"));
    } catch {
      localStorage.removeItem(storageKey);
    }
    setSettings(restored);
    applyAppearance(restored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    applyAppearance(settings);
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      return undefined;
    }

    if (settings.colorMode !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemMode = () => applyAppearance(settings);
    media.addEventListener("change", updateSystemMode);
    return () => media.removeEventListener("change", updateSystemMode);
  }, [ready, settings]);

  function updateSetting(name, value) {
    setSettings((current) => normalizeSettings({ ...current, [name]: value }));
  }

  return <AppearanceContext.Provider value={{ settings, updateSetting }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used within AppearanceProvider.");
  return context;
}