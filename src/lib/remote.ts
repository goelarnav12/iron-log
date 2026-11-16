// The translation boundary between the app's rows and the wire.
//
// This used to hold a camelCase <-> snake_case mapper per Postgres table. The
// Worker is a generic store that keeps each row as an opaque JSON `payload`, so
// all of that collapses into JSON.stringify / JSON.parse: rows go up exactly as
// IndexedDB holds them, and come back the same. A component still never sees
// `weight_kg`, because nothing produces it any more.
//
// `sync.ts` drives this; `backend.ts` is the only file that touches the network.

import { pull as backendPull, push as backendPush } from './backend';
import type { SyncFields, TableName } from './idb';

type Row = SyncFields & { id: string };

/**
 * Rows in `table` changed at or after `cursor`, oldest first. Tombstones
 * included — a delete that happened while this device was offline arrives as
 * an ordinary row.
 */
export async function pull(table: TableName, cursor: string | null): Promise<Row[]> {
  const records = await backendPull(table, cursor);
  return records.map((r) => {
    // updatedAt/deletedAt are also carried as columns (the cursor and LWW
    // compare those); trust them over the payload's copy so a row can never
    // disagree with itself.
    const row = JSON.parse(r.payload) as Row;
    return { ...row, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? null };
  });
}

/**
 * Upsert a batch. `id` is the key because the client generates it — that's
 * what makes an offline insert and its later sync the same row rather than two.
 */
export async function push(table: TableName, rows: Record<string, unknown>[]): Promise<void> {
  await backendPush(table, (rows as unknown as Row[]).map((row) => ({
    id: row.id,
    payload: JSON.stringify(row),
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  })));
}
