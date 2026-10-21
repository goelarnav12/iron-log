// The row of section links under a page title on a phone: History · Exercises
// · Body … under Progress. On desktop the sidebar lists the same links under
// their section, so the CSS hides this there.

import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { SECTIONS, type SectionId } from '../nav';

export function SubNav({ section }: { section: SectionId }) {
  const s = SECTIONS.find((x) => x.id === section)!;
  const ref = useRef<HTMLElement>(null);

  // Five links don't fit across a phone, so the row scrolls sideways. Bring
  // the current one into view, or on Trends you'd see no selection at all.
  useEffect(() => {
    const row = ref.current;
    const active = row?.querySelector<HTMLElement>('a.active');
    if (row && active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, []);

  return (
    <nav className="subnav" aria-label={`${s.label} sections`} ref={ref}>
      {s.pages.map((p) => (
        <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
