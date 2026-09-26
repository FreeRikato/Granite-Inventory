import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * Every worktree on a machine shares the one local Supabase, and both test suites truncate its
 * tables. This lock makes a second suite (from any worktree) wait for the first instead of wiping
 * its data mid-run. It is a directory because mkdir is atomic; the owner file names the holder so a
 * waiting run can say who it is waiting on, and a lock whose process has died is taken over.
 */
export const DB_LOCK_DIR = path.join(os.tmpdir(), "granite-inventory-db.lock");

type Owner = { readonly pid: number; readonly cwd: string };

function readOwner(dir: string): Owner | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(dir, "owner.json"), "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "pid" in parsed &&
      typeof parsed.pid === "number" &&
      "cwd" in parsed &&
      typeof parsed.cwd === "string"
    ) {
      return { pid: parsed.pid, cwd: parsed.cwd };
    }
    return null;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM means the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function tryTake(dir: string): boolean {
  try {
    mkdirSync(dir);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return false;
    throw error;
  }
  const owner: Owner = { pid: process.pid, cwd: process.cwd() };
  writeFileSync(path.join(dir, "owner.json"), JSON.stringify(owner));
  return true;
}

/** Waits for the lock and returns the function that releases it. */
export async function acquireDbLock(dir = DB_LOCK_DIR, pollMs = 1_000): Promise<() => void> {
  let announced = false;
  while (!tryTake(dir)) {
    const owner = readOwner(dir);
    // A missing owner file means the holder is between mkdir and writeFile, so only a dead pid is stale.
    if (owner && !isAlive(owner.pid)) {
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    if (!announced && owner) {
      console.log(`Waiting for the local DB, in use by tests in ${owner.cwd} (pid ${owner.pid})`);
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return () => {
    if (readOwner(dir)?.pid === process.pid) rmSync(dir, { recursive: true, force: true });
  };
}

/** Vitest and Playwright both accept a global setup whose return value is the teardown. */
export default function globalSetup(): Promise<() => void> {
  return acquireDbLock();
}
