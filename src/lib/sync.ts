// The sync loop: push the outbox, pull what changed, merge by last-write-wins.
//
// Ordering is deliberate — PULL FIRST, then push.
//
// Pulling first is what makes last-write-wins actually resolve. A pulled row
// carrying a NEWER updatedAt than the local copy means the other device won:
// the local row is overwritten and its outbox entry dropped, so the stale
// change is never pushed. Pushing first would blindly overwrite the server
// with the older value and the newer edit would be lost.
//
// Everything here is idempotent. A sync interrupted halfway (tab closed, signal
// lost) leaves the outbox intact and the cursor un-advanced, so the next run
// redoes the same work harmlessly.

import {
  PUSH_ORDER, getCursor, getRowRaw, outboxAll, outboxClear, outboxCount,
  outboxFail, outboxPut, putRow, setCursor, type SyncFields, type TableName,
} from './idb';
import { pull, push } from './remote';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

type Listener = (s: SyncStatus) => void;

let status: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };
const listeners = new Set<Listener>();
/** Guards against two syncs overlapping — the second would double-push. */
let running = false;
/** Set when a sync is requested while one is already in flight. */
let rerun = false;
let timer: ReturnType<typeof setInterval> | null = null;

export const getStatus = (): SyncStatus => status;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

/** Give up on a row after this many failed pushes and surface it, rather than
 *  retrying a permanently-rejected write forever. */
const MAX_ATTEMPTS = 6;

// ---------------------------------------------------------------------------

/**
 * Apply a pulled row, resolving against any local edit of the same row.
 *
 * Returns true if the remote row won. When it does, any queued local change
 * for that row is dropped — it lost, and pushing it would undo the winner.
 */
async function merge(table: TableName, remote: SyncFields & { id: string }): Promise<boolean> {
  // getRowRaw, not getRow: the latter hides tombstones, and a locally deleted
  // row still has to take part in the comparison.
  const local = await getRowRaw<SyncFields & { id: string }>(table, remote.id);

  if (local && local.updatedAt > remote.updatedAt) {
    // Local edit is newer. Keep it and let the pending push carry it up.
    return false;
  }
  await putRow(table, remote, { enqueue: false });
  await outboxClear(`${table}:${remote.id}`);
  return true;
}

async function pullAll(): Promise<void> {
  for (const table of PUSH_ORDER) {
    const cursor = await getCursor(table);
    const rows = await pull(table, cursor);
    if (!rows.length) continue;
    for (const r of rows) await merge(table, r as SyncFields & { id: string });
    // Advance to the newest row seen. Rows share timestamps only at millisecond
    // granularity, and `pull` uses a strict `>`, so a tie would be skipped —
    // hence ordering by updated_at and taking the last one, not max-plus-one.
    const newest = rows[rows.length - 1] as SyncFields;
    await setCursor(table, newest.updatedAt);
  }
}

async function pushAll(): Promise<void> {
  const entries = await outboxAll();
  if (!entries.length) return;

  // Group by table and push in PUSH_ORDER, so a parent row always lands before
  // the child that references it. Without this a set can arrive before its
  // workout_exercise and Postgres rejects it on the foreign key.
  for (const table of PUSH_ORDER) {
    const forTable = entries.filter((e) => e.table === table && e.attempts < MAX_ATTEMPTS);
    if (!forTable.length) continue;

    const rows: unknown[] = [];
    const keys: string[] = [];
    for (const e of forTable) {
      const row = await getRowRaw(table, e.rowId);
      if (!row) {
        // Row vanished locally without a tombstone — nothing to send.
        await outboxClear(e.key);
        continue;
      }
      rows.push(row);
      keys.push(e.key);
    }
    if (!rows.length) continue;

    try {
      await push(table, rows as Record<string, unknown>[]);
      for (const k of keys) await outboxClear(k);
    } catch (err) {
      // Fail the whole batch rather than guessing which row Postgres rejected.
      // Each retry re-attempts them individually once attempts climb, and a
      // genuinely bad row eventually crosses MAX_ATTEMPTS and stops blocking.
      const msg = err instanceof Error ? err.message : String(err);
      for (const k of keys) await outboxFail(k, msg);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Run one sync cycle. Safe to call at any time and from anywhere — concurrent
 * calls collapse into a single run followed by one repeat if needed.
 */
export async function syncNow(): Promise<void> {
  if (running) { rerun = true; return; }
  running = true;
  emit({ state: 'syncing', error: null });

  try {
    await pullAll();
    await pushAll();
    emit({
      state: 'idle',
      pending: await outboxCount(),
      lastSyncedAt: new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A network failure is "offline", not an error to alarm the user with —
    // the writes are safe on disk and will go up when the signal returns.
    const offline = !navigator.onLine || /fetch|network|Failed to fetch/i.test(msg);
    emit({
      state: offline ? 'offline' : 'error',
      pending: await outboxCount(),
      error: offline ? null : msg,
    });
  } finally {
    running = false;
    if (rerun) { rerun = false; void syncNow(); }
  }
}

/** Refresh just the pending count, without touching the network. */
export async function refreshPending(): Promise<void> {
  emit({ pending: await outboxCount() });
}

/**
 * Start background syncing: every 30s, on regaining connectivity, and whenever
 * the tab comes back to the foreground (a phone that slept through a set needs
 * to catch up the moment you look at it).
 */
export function startSync(): () => void {
  const onOnline = () => void syncNow();
  const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  timer = setInterval(() => void syncNow(), 30_000);
  void syncNow();

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (timer) clearInterval(timer);
    timer = null;
  };
}

/** Rows stuck past MAX_ATTEMPTS, for the sync detail UI. */
export async function stuckEntries() {
  return (await outboxAll()).filter((e) => e.attempts >= MAX_ATTEMPTS);
}

/** Clear the attempt counters so a stuck write is tried again. */
export async function retryStuck(): Promise<void> {
  for (const e of await outboxAll()) {
    await outboxPut({ ...e, attempts: 0, lastError: null });
  }
  await syncNow();
}

/** True once the first pull has populated the mirror on this device. */
export async function hasLocalData(): Promise<boolean> {
  return (await getCursor('exercises')) != null;
}
