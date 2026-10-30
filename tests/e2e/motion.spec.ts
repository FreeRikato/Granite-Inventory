import type { Page } from "@playwright/test";
import { ensureTestUsers, expect, openPalette, test } from "./fixtures";

const IDENTITY = /^translate3d\(0(px)?, ?0(px)?, ?0(px)?\) scale3d\(1, ?1, ?1\) rotate\(0(deg)?\)$/;

async function transformsWhile(page: Page, open: () => Promise<void>): Promise<string[]> {
  await page.evaluate(() => {
    const seen = new Set<string>();
    const w = window as unknown as { __transforms: Set<string> };
    w.__transforms = seen;
    const tick = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes() ?? []) {
          const transform = frame.transform;
          if (typeof transform === "string" && transform !== "none") seen.add(transform);
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await open();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
  const seen = await page.evaluate(() => [...(window as unknown as { __transforms: Set<string> }).__transforms]);
  return seen.filter((transform) => !IDENTITY.test(transform));
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.describe("normal motion", () => {
  test("a dialog zooms in", async ({ page, signIn }, info) => {
    test.skip(info.project.name !== "desktop");
    await signIn("admin");
    await page.goto("/");
    const moving = await transformsWhile(page, () => openPalette(page));
    expect(moving.length).toBeGreaterThan(0);
  });

  test("the More sheet slides up", async ({ page, signIn }, info) => {
    test.skip(info.project.name !== "mobile");
    await signIn("admin");
    await page.goto("/");
    const moving = await transformsWhile(page, () => page.getByRole("button", { name: "More" }).click());
    expect(moving.length).toBeGreaterThan(0);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a dialog runs no transform animation", async ({ page, signIn }, info) => {
    test.skip(info.project.name !== "desktop");
    await signIn("admin");
    await page.goto("/");
    expect(await transformsWhile(page, () => openPalette(page))).toEqual([]);
  });

  test("the More sheet runs no transform animation", async ({ page, signIn }, info) => {
    test.skip(info.project.name !== "mobile");
    await signIn("admin");
    await page.goto("/");
    const moving = await transformsWhile(page, () => page.getByRole("button", { name: "More" }).click());
    expect(moving).toEqual([]);
  });
});
