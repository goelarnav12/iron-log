// Inline stroke icons. Hand-drawn on a 24px grid so they match the square,
// heavy-stroked look of the rest of the UI — and so the app has no icon
// dependency to keep current. They inherit `currentColor`, so an icon takes
// the colour of the link or button it sits in.

const PATHS = {
  today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  train: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  progress: 'M3 20h18M5 16l5-5 4 3 6-7',
  you: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
