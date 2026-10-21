// The app's four sections and the pages that live under each. The tab bar,
// the sidebar and the per-section SubNav all read from here, so a page moves
// sections by moving it in this list.
//
// URLs are deliberately NOT nested under the section (`/history`, not
// `/progress/history`): every link, bookmark and the PWA's saved routes from
// before the redesign keep working, and a section is just a set of prefixes.

import type { IconName } from './components/Icon';

export type SectionId = 'today' | 'train' | 'progress' | 'you';

interface SectionPage { to: string; label: string; end?: boolean }

interface Section {
  id: SectionId;
  label: string;
  icon: IconName;
  /** Where the tab goes. */
  to: string;
  /** Sub-pages, shown under the section in the sidebar and in its SubNav. */
  pages: SectionPage[];
  /** Path prefixes that light the section up. */
  prefixes: string[];
}

export const SECTIONS: Section[] = [
  {
    id: 'today', label: 'Today', icon: 'today', to: '/',
    pages: [{ to: '/', label: 'Today', end: true }, { to: '/daily', label: 'Daily' }],
    prefixes: ['/daily'],
  },
  {
    id: 'train', label: 'Train', icon: 'train', to: '/train',
    pages: [],
    prefixes: ['/train', '/workout', '/routines'],
  },
  {
    id: 'progress', label: 'Progress', icon: 'progress', to: '/history',
    pages: [
      { to: '/history', label: 'History' },
      { to: '/exercises', label: 'Exercises' },
      { to: '/body', label: 'Body' },
      { to: '/cardio', label: 'Cardio' },
      { to: '/trends', label: 'Trends' },
    ],
    prefixes: ['/history', '/exercises', '/body', '/cardio', '/trends'],
  },
  {
    id: 'you', label: 'You', icon: 'you', to: '/settings',
    pages: [],
    prefixes: ['/settings'],
  },
];

/** The section a path belongs to. Anything unclaimed is Today, which owns `/`. */
export function sectionFor(pathname: string): SectionId {
  const hit = SECTIONS.find((s) => s.prefixes.some((p) => pathname.startsWith(p)));
  return hit?.id ?? 'today';
}
