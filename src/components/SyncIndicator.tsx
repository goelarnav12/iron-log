// Sync state, in one dot.
//
// The whole point of a local-first app is that writes succeed instantly whether
// or not there's signal — which means the UI has to say somewhere whether your
// workout has actually reached the server, or you'd have no way to tell a
// synced session from one stranded on a phone.

import { useStore } from '../state/store';

export function SyncIndicator() {
  const { syncStatus, syncNow, retryStuck } = useStore();
  const { state, pending, error, lastSyncedAt } = syncStatus;

  const tone =
    state === 'error' ? 'bad'
    : state === 'offline' ? 'warn'
    : pending > 0 ? 'warn'
    : 'good';

  const label =
    state === 'error' ? 'Sync failed'
    : state === 'offline' ? (pending ? `${pending} waiting` : 'Offline')
    : state === 'syncing' ? 'Syncing…'
    : pending > 0 ? `${pending} waiting`
    : 'Synced';

  const title =
    error ? `Sync error: ${error}`
    : state === 'offline' ? 'Changes are saved on this device and will upload when you reconnect.'
    : lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : 'Not synced yet';

  return (
    <button
      className={`sync-dot ${tone}`}
      title={title}
      onClick={() => void (state === 'error' ? retryStuck() : syncNow())}
    >
      <span className={`dot ${state === 'syncing' ? 'spin' : ''}`} />
      <span className="txt">{label}</span>
    </button>
  );
}
