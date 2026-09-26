import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireDbLock } from "../db-lock";

// A fresh lock dir per test, so these never contend with the real lock this suite holds.
const lockDir = () => path.join(mkdtempSync(path.join(os.tmpdir(), "db-lock-test-")), "lock");

describe("acquireDbLock", () => {
  it("makes a second run wait until the first releases", async () => {
    const dir = lockDir();
    const releaseFirst = await acquireDbLock(dir, 10);
    let secondGotIt = false;
    const second = acquireDbLock(dir, 10).then((release) => {
      secondGotIt = true;
      return release;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondGotIt).toBe(false);

    releaseFirst();
    const releaseSecond = await second;
    expect(secondGotIt).toBe(true);
    releaseSecond();
  });

  it("takes over a lock whose holder has died", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    // pid 2^22 + 1 is above the default pid ceiling on macOS and Linux, so nothing is running there.
    writeFileSync(path.join(dir, "owner.json"), JSON.stringify({ pid: 4_194_305, cwd: "/gone" }));

    const release = await acquireDbLock(dir, 10);
    release();
  });
});
