import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "hisaab-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

function storedChoice(): Theme | null {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

/**
 * Light or dark, and how the two are decided.
 *
 * Two states, not three. Until the owner touches the toggle there is no stored
 * choice and no `data-theme` attribute, so the CSS media query decides and the
 * app follows the operating system live — including a system that flips at
 * sunset. The first press writes a choice, which pins the theme from then on.
 *
 * That is why the attribute is *removed* rather than set to a default: an
 * attribute is a decision, and setting one before the owner has made a decision
 * would silently opt him out of his own system setting.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [choice, setChoice] = useState<Theme | null>(storedChoice);
  const [system, setSystem] = useState<Theme>(systemTheme);

  // Keeps the "no choice yet" case following the OS after first render.
  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query?.addEventListener) return;

    const onChange = (event: MediaQueryListEvent) =>
      setSystem(event.matches ? "dark" : "light");

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const theme = choice ?? system;

  useEffect(() => {
    const root = document.documentElement;
    if (choice) root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
  }, [choice]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    setChoice(next);
  }, [theme]);

  return { theme, toggle };
}
