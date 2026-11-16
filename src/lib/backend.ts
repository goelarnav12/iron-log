// The only file that talks to the network.
//
// Everything the app sends or receives over HTTP goes through here: opaque JSON
// `payload`s plus the sync bookkeeping, gated by a bearer token, sent to this
// app's own Cloudflare Worker (`worker/`). Same shape as Tally's backend, but a
// separate copy talking to a separate Worker and D1 database.
//
// The token is the auth hash derived from the sync password (see auth.ts). It
// is held in a module variable AND persisted to localStorage, so you aren't
// asked for the password on every launch of the app mid-gym.

import { deriveAuthHash, makeSalt } from './auth';

const API = import.meta.env.VITE_API_URL as string | undefined;

/** False until .env.local has VITE_API_URL; App shows a setup panel instead. */
export const syncConfigured = Boolean(API);

const TOKEN_KEY = 'ht.syncToken';

let token: string | null = syncConfigured ? localStorage.getItem(TOKEN_KEY) : null;

export const isSignedIn = (): boolean => token !== null;

function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function signOut(): void {
  setToken(null);
}

export class BackendError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  if (!API) throw new Error('Sync is not configured');
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (auth) {
    if (!token) throw new Error('Not signed in');
    headers.set('authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    // The Worker returns { error } and never quotes row data, so surfacing the
    // message is safe and helps ("Wrong sync password", "Origin not allowed").
    const msg = await res.json().then((b) => (b as { error?: string }).error).catch(() => null);
    throw new BackendError(msg ?? `Request failed (${res.status})`, res.status);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Password / session
// ---------------------------------------------------------------------------

interface SaltInfo { salt: string; kdfIterations: number }

/** The store's salt, or null before anyone has set a password. */
export async function getSalt(): Promise<SaltInfo | null> {
  const res = await call('/salt', {}, false);
  return res.json() as Promise<SaltInfo | null>;
}

/** Claim a brand-new store with a password, and keep the token on success. */
export async function signup(password: string): Promise<void> {
  const salt = makeSalt();
  const authHash = await deriveAuthHash(password, salt);
  await call('/signup', { method: 'POST', body: JSON.stringify({ salt, authHash }) }, false);
  setToken(authHash);
}

/** Sign in to an existing store. Throws BackendError(401) on a wrong password. */
export async function login(password: string): Promise<void> {
  const info = await getSalt();
  if (!info) throw new Error('No log exists yet — set a password to create one.');
  const authHash = await deriveAuthHash(password, info.salt, info.kdfIterations);
  await call('/login', { method: 'POST', body: JSON.stringify({ authHash }) }, false);
  setToken(authHash);
}

/**
 * Change the sync password. Verifies the current one first (so a typo can't
 * lock you out), then swaps in a new hash against the same salt. Other devices
 * get a 401 on their next sync and are asked for the new password.
 */
export async function changePassword(current: string, next: string): Promise<void> {
  const info = await getSalt();
  if (!info) throw new Error('No log to change.');
  await login(current);
  const newHash = await deriveAuthHash(next, info.salt, info.kdfIterations);
  await call('/auth-password', { method: 'PUT', body: JSON.stringify({ authHash: newHash }) });
  setToken(newHash);
}

// ---------------------------------------------------------------------------
// Sync transport — one store at a time, matching sync.ts's per-table loop
// ---------------------------------------------------------------------------

export interface RemoteRecord {
  id: string;
  payload: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Records for one store changed at or after `since` (null = everything). */
export async function pull(table: string, since: string | null): Promise<RemoteRecord[]> {
  const q = new URLSearchParams({ table });
  if (since) q.set('since', since);
  const res = await call(`/pull?${q.toString()}`);
  return res.json() as Promise<RemoteRecord[]>;
}

/**
 * Rows per request. Each row is one D1 statement, and the Workers free plan
 * caps queries per invocation (50, auth check included), so a long offline
 * session's outbox goes up in slices rather than as one request that fails.
 */
const PUSH_CHUNK = 40;

/** Batch upsert one store's records. */
export async function push(table: string, records: RemoteRecord[]): Promise<void> {
  for (let i = 0; i < records.length; i += PUSH_CHUNK) {
    const slice = records.slice(i, i + PUSH_CHUNK);
    await call('/push', { method: 'POST', body: JSON.stringify({ table, records: slice }) });
  }
}
