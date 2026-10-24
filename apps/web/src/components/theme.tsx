"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { DARK_QUERY, STORAGE_KEY, THEME_SCRIPT } from "./theme-script";

/**
 * Light/dark/system theme. The initial class is applied before first paint by
 * <ThemeScript /> (rendered in the root layout's <head>), so there's no flash.
 */
export type ThemePreference = "light" | "dark" | "system";

/**
 * Runs THEME_SCRIPT from the server-rendered HTML. In the browser it's typed as a data
 * block: the server copy has already run, and if React ever re-creates the document
 * (e.g. while recovering from an error) it neither executes it nor warns about it.
 */
export function ThemeScript() {
  return (
    <script
      suppressHydrationWarning
      type={typeof window === "undefined" ? undefined : "text/plain"}
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

// Preference store: localStorage + same-tab listeners + cross-tab "storage" events.
const listeners = new Set<() => void>();

function subscribePreference(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function writePreference(next: ThemePreference) {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable (private mode): nothing persists.
  }
  for (const listener of listeners) listener();
}

const noopSubscribe = () => () => {};

function subscribeSystem(callback: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function applyTheme(resolved: "light" | "dark", disableTransitions: boolean) {
  const root = document.documentElement;
  let style: HTMLStyleElement | null = null;
  if (disableTransitions) {
    style = document.createElement("style");
    style.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(style);
  }
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  if (style) {
    // Force a reflow so the change is applied without transitions, then restore them.
    void window.getComputedStyle(root).opacity;
    const node = style;
    window.setTimeout(() => node.remove(), 1);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribePreference, readPreference, () => "system" as const);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    // THEME_SCRIPT already set the initial class; only react to real changes after hydration.
    if (hydrated) applyTheme(resolvedTheme, true);
  }, [hydrated, resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => writePreference(next), []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
