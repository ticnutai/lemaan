import { useCallback, useMemo } from "react";
import { useStudy } from "@/lib/study/store";

export const COLOR_FAVORITES_LIMIT = 24;

export function normalizeHexColor(input: string): string | null {
  const value = input.trim().toLowerCase();
  const short = value.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const long = value.match(/^#([0-9a-f]{6})$/i);
  if (!long) return null;
  return `#${long[1]}`;
}

const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export function useColorFavorites() {
  const { state, setUiPref } = useStudy();

  const favorites = useMemo(() => {
    const raw = state.uiPrefs?.colorFavorites ?? [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of raw) {
      if (typeof value !== "string") continue;
      const color = normalizeHexColor(value);
      if (!color || seen.has(color)) continue;
      seen.add(color);
      normalized.push(color);
      if (normalized.length >= COLOR_FAVORITES_LIMIT) break;
    }
    return normalized;
  }, [state.uiPrefs?.colorFavorites]);

  const addFavorite = useCallback((value: string) => {
    const color = normalizeHexColor(value);
    if (!color) return;
    const next = [color, ...favorites.filter((c) => c !== color)].slice(0, COLOR_FAVORITES_LIMIT);
    setUiPref("colorFavorites", next);
  }, [favorites, setUiPref]);

  const removeFavorite = useCallback((value: string) => {
    const color = normalizeHexColor(value);
    if (!color) return;
    const next = favorites.filter((c) => c !== color);
    setUiPref("colorFavorites", next);
  }, [favorites, setUiPref]);

  const moveFavorite = useCallback((from: number, to: number) => {
    const next = moveItem(favorites, from, to);
    if (next === favorites) return;
    setUiPref("colorFavorites", next);
  }, [favorites, setUiPref]);

  return { favorites, addFavorite, removeFavorite, moveFavorite };
}
