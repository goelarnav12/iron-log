// Small presentational pieces shared across pages. Anything with its own data
// dependency belongs in a page or a dedicated component file, not here.

import { useEffect, type ReactNode } from 'react';

export function Modal({
  title, onClose, children, footer, wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Escape closes. Registered per-instance so a stacked modal closes topmost
  // first purely by virtue of mounting later.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={wide ? 'modal wide' : 'modal'}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label, value, unit, sub, tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className={`delta ${tone ?? 'faint'}`}>{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({
  label, children,
}: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/**
 * Destructive actions are two-step: the first click arms for 4 seconds, the
 * second commits. There is no undo anywhere in this app, and a mis-tap on a
 * phone mid-workout is easy.
 */
export function ConfirmButton({
  onConfirm, children, armedLabel = 'Sure?', className = 'btn danger sm', armed, setArmed,
}: {
  onConfirm: () => void;
  children: ReactNode;
  armedLabel?: string;
  className?: string;
  armed: boolean;
  setArmed: (v: boolean) => void;
}) {
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed, setArmed]);

  return (
    <button
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (armed) { onConfirm(); setArmed(false); } else setArmed(true);
      }}
    >
      {armed ? armedLabel : children}
    </button>
  );
}
