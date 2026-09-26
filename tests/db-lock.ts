import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

export async function acquireDbLock(dir = DB_LOCK_DIR, pollMs = 1_000): Promise<() => void> {
  let announced = false;
  while (!tryTake(dir)) {
    const owner = readOwner(dir);
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

export default function globalSetup(): Promise<() => void> {
  return acquireDbLock();
}
