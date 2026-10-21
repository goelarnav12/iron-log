// Colour themes. The colours themselves live in index.css as one
// `[data-theme="…"]` block each; this file only lists them, remembers the
// choice, and puts it on <html>.
//
// A display preference, so localStorage — like units and rest time. It's
// applied in main.tsx before React renders, so a reload never flashes the
// default theme first.

export const THEMES = [
  { id: 'volt', label: 'Volt', hint: 'Graphite and lime' },
  { id: 'plate', label: 'Plate', hint: 'Black and orange' },
  { id: 'cobalt', label: 'Cobalt', hint: 'Navy and blue' },
  { id: 'crimson', label: 'Crimson', hint: 'Charcoal and red' },
  { id: 'mint', label: 'Mint', hint: 'Green-black and mint' },
  { id: 'ultraviolet', label: 'Ultraviolet', hint: 'Ink and violet' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const THEME_KEY = 'ht.theme';

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : 'volt';
  } catch {
    return 'volt';
  }
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  // The browser chrome (and the iOS status bar in a standalone PWA) takes its
  // colour from this meta tag, so it follows the theme's ground colour.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function saveTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // Private mode: the theme still applies for this session.
  }
  applyTheme(id);
}
