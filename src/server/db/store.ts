import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "@/lib/types";
import { buildSeed, SCHEMA_VERSION } from "./seed";

/**
 * Local datastore. The MVP target is PostgreSQL (see docs/ARCHITECTURE.md and db/schema.sql);
 * this JSON-backed store keeps the same tenant-scoped access pattern so services don't change
 * when the repository is swapped. All reads/writes go through src/server/services — never
 * directly from route handlers or components.
 */

// Serverless hosts (Vercel) have a read-only deployment directory; only /tmp is writable there.
const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.cwd(),
  process.env.FABRIK_DATA_DIR || (process.env.VERCEL ? "/tmp/fabrik-data" : ".data"),
);
// On Vercel, /tmp lives exactly as long as the instance's memory, so writing the 10 MB file after
// every change only costs time. Elsewhere the file keeps the demo across server restarts.
const PERSIST = process.env.FABRIK_PERSIST ? process.env.FABRIK_PERSIST !== "false" : !process.env.VERCEL;
const FILE = path.join(DATA_DIR, "fabrik-db.json");

declare global {
  // eslint-disable-next-line no-var
  var __fabrikDb: DB | undefined;
  // eslint-disable-next-line no-var
  var __fabrikSaveTimer: ReturnType<typeof setTimeout> | undefined;
}

export function db(): DB {
  if (!globalThis.__fabrikDb) globalThis.__fabrikDb = load();
  return globalThis.__fabrikDb;
}

function load(): DB {
  if (PERSIST && fs.existsSync(FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
      if (parsed.version === SCHEMA_VERSION) return parsed;
    } catch {
      // Corrupt or outdated file — fall through and reseed.
    }
  }
  const seeded = buildSeed();
  writeNow(seeded);
  return seeded;
}

/** Schedule a durable write of the current state (batched). Call after every mutation. */
export function commit(): void {
  if (!PERSIST) return;
  if (globalThis.__fabrikSaveTimer) clearTimeout(globalThis.__fabrikSaveTimer);
  globalThis.__fabrikSaveTimer = setTimeout(() => writeNow(db()), 200);
}

function writeNow(data: DB): void {
  if (!PERSIST) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

/** Restore the permanent seeded demo environment (Fabrik Admin only). */
export function resetDb(): DB {
  // Keep people signed in across a demo reset (seeded user ids are stable).
  const sessions = globalThis.__fabrikDb?.sessions ?? [];
  globalThis.__fabrikDb = buildSeed();
  globalThis.__fabrikDb.sessions = sessions.filter((s) => globalThis.__fabrikDb!.users.some((u) => u.id === s.userId));
  writeNow(globalThis.__fabrikDb);
  return globalThis.__fabrikDb;
}

export function uploadsDir(): string {
  const dir = path.join(DATA_DIR, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
