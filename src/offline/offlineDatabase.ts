import Dexie, { type Table } from "dexie";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OfflineRow = { id: string; user_id: string; [key: string]: unknown };

type CachedRecord = OfflineRow & { table: string };
type TableMarker = { userId: string; table: string; updatedAt: number };
export type OfflineRecordChange =
  | { kind: "upsert"; table: string; row: CachedRecord }
  | { kind: "delete"; table: string; id: string; match?: Record<string, string | number | boolean | null> };
type ServerRequest =
  | { kind: "upsert"; table: string; payload: Record<string, unknown>; onConflict: string }
  | { kind: "delete"; table: string; id: string; match?: Record<string, string | number | boolean | null> }
  | { kind: "rpc"; functionName: string; args: Record<string, unknown> };
type PendingMutation = {
  id: string;
  userId: string;
  createdAt: number;
  request: ServerRequest;
  changes: OfflineRecordChange[];
};

function requireOnline() {
  if (!navigator.onLine) throw new Error("You are offline. Reconnect to the internet before making changes.");
}

class LifeOSOfflineDatabase extends Dexie {
  records!: Table<CachedRecord, [string, string, string]>;
  markers!: Table<TableMarker, [string, string]>;
  outbox!: Table<PendingMutation, string>;

  constructor() {
    super("lifeos-offline");
    this.version(1).stores({
      records: "&[user_id+table+id],[user_id+table],user_id,table",
      markers: "&[userId+table]",
      outbox: "&id,userId,createdAt",
    });
  }
}

const database = new LifeOSOfflineDatabase();
const localMutationEvent = "lifeos-local-data-changed";

function announceLocalChange(userId: string) {
  window.dispatchEvent(new CustomEvent(localMutationEvent, { detail: { userId } }));
}

function cachedRecordKey(userId: string, table: string, id: string): [string, string, string] {
  return [userId, table, id];
}

async function applyLocalChange(userId: string, change: OfflineRecordChange) {
  if (change.kind === "upsert") {
    await database.records.put(change.row);
    return;
  }
  if (change.match) {
    const records = await database.records.where("[user_id+table]").equals([userId, change.table]).toArray();
    const matchingIds = records.filter((row) => Object.entries(change.match ?? {}).every(([key, value]) => row[key] === value)).map((row) => row.id);
    await database.records.bulkDelete(matchingIds.map((id) => cachedRecordKey(userId, change.table, id)));
    return;
  }
  await database.records.delete(cachedRecordKey(userId, change.table, change.id));
}

export async function getCachedRows(userId: string, table: string) {
  const [marker, rows] = await Promise.all([
    database.markers.get([userId, table]),
    database.records.where("[user_id+table]").equals([userId, table]).toArray(),
  ]);
  return { ready: Boolean(marker) || rows.length > 0, rows: rows.map(({ table: _table, ...row }) => row as OfflineRow) };
}

export async function cacheServerRows(userId: string, table: string, serverRows: OfflineRow[]) {
  const pending = await database.outbox.where("userId").equals(userId).sortBy("createdAt");
  const rows = new Map(serverRows.map((row) => [row.id, { ...row, table } as CachedRecord]));
  for (const mutation of pending) {
    for (const change of mutation.changes) {
      if (change.table !== table) continue;
      if (change.kind === "upsert") rows.set(change.row.id, change.row);
      else if (change.match) {
        for (const [id, row] of rows) {
          if (Object.entries(change.match).every(([key, value]) => row[key] === value)) rows.delete(id);
        }
      } else rows.delete(change.id);
    }
  }
  await database.transaction("rw", database.records, database.markers, async () => {
    await database.records.where("[user_id+table]").equals([userId, table]).delete();
    await database.records.bulkPut([...rows.values()]);
    await database.markers.put({ userId, table, updatedAt: Date.now() });
  });
  return [...rows.values()].map(({ table: _table, ...row }) => row as OfflineRow);
}

export async function readCachedRow(userId: string, table: string, id: string) {
  const row = await database.records.get(cachedRecordKey(userId, table, id));
  if (!row) return null;
  const { table: _table, ...cached } = row;
  return cached as OfflineRow;
}

export async function readCachedSingle(userId: string, table: string) {
  const { ready, rows } = await getCachedRows(userId, table);
  return { ready, row: rows[0] ?? null };
}

export async function enqueueUpsert(
  userId: string,
  table: string,
  payload: Record<string, unknown>,
  options: { onConflict?: string; cacheId?: string } = {},
) {
  requireOnline();
  const id = options.cacheId ?? String(payload.id ?? (options.onConflict === "user_id" ? userId : crypto.randomUUID()));
  const serverPayload: Record<string, unknown> = { ...payload, user_id: userId };
  if (!options.onConflict || options.onConflict !== "user_id") serverPayload.id = id;
  const change: OfflineRecordChange = {
    kind: "upsert",
    table,
    row: { ...serverPayload, id, user_id: userId, table } as CachedRecord,
  };
  const mutation: PendingMutation = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    request: { kind: "upsert", table, payload: serverPayload, onConflict: options.onConflict ?? "id" },
    changes: [change],
  };
  await database.transaction("rw", database.records, database.outbox, async () => {
    const existing = options.onConflict && options.onConflict !== "id"
      ? (await database.records.where("[user_id+table]").equals([userId, table]).toArray())
        .find((row) => options.onConflict!.split(",").every((field) => row[field.trim()] === serverPayload[field.trim()]))
      : await database.records.get(cachedRecordKey(userId, table, id));
    if (existing && existing.id !== id) {
      change.row.id = existing.id;
      if (change.row.id !== serverPayload.id) serverPayload.id = existing.id;
    }
    change.row = { ...existing, ...change.row };
    await database.records.put(change.row);
    await database.outbox.add(mutation);
  });
  announceLocalChange(userId);
  const { table: _table, ...row } = change.row;
  return row as OfflineRow;
}

export async function enqueueDelete(
  userId: string,
  table: string,
  id: string,
  match?: Record<string, string | number | boolean | null>,
) {
  requireOnline();
  const change: OfflineRecordChange = { kind: "delete", table, id, match };
  const mutation: PendingMutation = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    request: { kind: "delete", table, id, match },
    changes: [change],
  };
  await database.transaction("rw", database.records, database.outbox, async () => {
    await applyLocalChange(userId, change);
    await database.outbox.add(mutation);
  });
  announceLocalChange(userId);
}

export async function enqueueRpc(
  userId: string,
  functionName: string,
  args: Record<string, unknown>,
  changes: OfflineRecordChange[],
) {
  requireOnline();
  const mutation: PendingMutation = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    request: { kind: "rpc", functionName, args },
    changes,
  };
  await database.transaction("rw", database.records, database.outbox, async () => {
    for (const change of changes) await applyLocalChange(userId, change);
    await database.outbox.add(mutation);
  });
  announceLocalChange(userId);
}

export async function countPendingMutations(userId: string) {
  return database.outbox.where("userId").equals(userId).count();
}

export async function clearPendingMutations(userId: string) {
  await database.outbox.where("userId").equals(userId).delete();
}

export async function syncPendingMutations(client: SupabaseClient, userId: string) {
  const pending = await database.outbox.where("userId").equals(userId).sortBy("createdAt");
  let synced = 0;
  for (const mutation of pending) {
    let error: { message: string } | null = null;
    if (mutation.request.kind === "upsert") {
      ({ error } = await client.from(mutation.request.table)
        .upsert(mutation.request.payload, { onConflict: mutation.request.onConflict }));
    } else if (mutation.request.kind === "delete") {
      let query = client.from(mutation.request.table).delete().eq("user_id", userId);
      if (mutation.request.match) query = query.match(mutation.request.match);
      else query = query.eq("id", mutation.request.id);
      ({ error } = await query);
    } else {
      ({ error } = await client.rpc(mutation.request.functionName, mutation.request.args));
    }
    if (error) {
      const failure = new Error(error.message);
      Object.assign(failure, { mutationId: mutation.id });
      throw failure;
    }
    await database.outbox.delete(mutation.id);
    synced += 1;
  }
  if (synced) announceLocalChange(userId);
  return { synced, remaining: await countPendingMutations(userId) };
}

export async function syncAfterLocalWrite(client: SupabaseClient, userId: string) {
  try {
    const result = await syncPendingMutations(client, userId);
    return { ...result, error: null as string | null };
  } catch (error) {
    return {
      synced: 0,
      remaining: await countPendingMutations(userId),
      error: error instanceof Error ? error.message : "The change is saved on this device and will sync later.",
    };
  }
}

export async function clearUserOfflineData(userId: string) {
  await database.transaction("rw", database.records, database.markers, database.outbox, async () => {
    await database.records.where("user_id").equals(userId).delete();
    await database.markers.where("userId").equals(userId).delete();
    await database.outbox.where("userId").equals(userId).delete();
  });
  announceLocalChange(userId);
}

export function subscribeToLocalChanges(userId: string, callback: () => void) {
  const listener = (event: Event) => {
    if ((event as CustomEvent<{ userId: string }>).detail.userId === userId) callback();
  };
  window.addEventListener(localMutationEvent, listener);
  return () => window.removeEventListener(localMutationEvent, listener);
}
