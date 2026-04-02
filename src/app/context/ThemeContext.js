import { get, writable } from 'svelte/store';

const THEME_STORAGE_KEY = 'ims-theme';

export const theme = writable('light');

function applyThemeClass(nextTheme) {
  if (typeof document === 'undefined') {
    return;
  }

  const isDark = nextTheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
}

export function setTheme(nextTheme) {
  const normalized = nextTheme === 'dark' ? 'dark' : 'light';
  applyThemeClass(normalized);
  theme.set(normalized);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  }
}

export function initializeTheme() {
  if (typeof window === 'undefined') {
    return;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light') {
    setTheme(storedTheme);
    return;
  }

  setTheme('light');
}

export function toggleTheme() {
  const current = get(theme);
  setTheme(current === 'dark' ? 'light' : 'dark');
}
