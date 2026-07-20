// Everything that doesn't earn a permanent tab on a phone.
//
// The desktop sidebar lists all eight destinations. A phone tab bar can hold
// about five before the targets get too narrow to hit reliably mid-set, so the
// rest live behind "More" — which is also where the account and sync controls
// go, since the sidebar footer that held them isn't rendered at this width.

import { NavLink } from 'react-router-dom';
import { useStore } from '../state/store';
import { SyncIndicator } from './SyncIndicator';

export interface MoreItem { to: string; icon: string; label: string; hint: string }

export function MoreSheet({
  items, onClose,
}: {
  items: MoreItem[];
  onClose: () => void;
}) {
  const { session, signOut } = useStore();

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>More</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={onClose} className="list-link">
              <div className="row">
                <span className="ico" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{n.icon}</span>
                <div className="grow">
                  <div className="title">{n.label}</div>
                  <div className="meta">{n.hint}</div>
                </div>
                <span className="faint">›</span>
              </div>
            </NavLink>
          ))}

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
            <SyncIndicator />
            <div className="faint" style={{ fontSize: 12, margin: '10px 0', wordBreak: 'break-all' }}>
              {session?.user.email}
            </div>
            <button className="btn danger sm" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
