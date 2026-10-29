import type { Locator, Page } from "@playwright/test";
import { expect, test, ensureTestUsers, resetDomainData } from "./fixtures";
import { seedYard } from "./seed";
import { sql } from "../seam/harness";

type Recorded = { readonly name: string; readonly pseudo: string; readonly transforms: string[] };

declare global {
  interface Window {
    __vt: { types: string[][]; animations: Recorded[] };
    __clickAt: number;
    __pendingAt: number;
    __toastFrames: { withBoth: number; overlapping: number };
  }
}

test.beforeAll(async () => {
  await ensureTestUsers();
});

test.beforeEach(async () => {
  await resetDomainData();
  await seedYard();
  await sql(
    `insert into public.customers (name, phone, customer_type) values ('Murugan Constructions', '+91 98765 43210', 'CONTRACTOR')`,
  );
});

async function recordTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record: Window["__vt"] = { types: [], animations: [] };
    window.__vt = record;
    const start = document.startViewTransition;
    if (typeof start !== "function") return;
    document.startViewTransition = function (arg) {
      const transition = start.call(document, arg);
      record.types.push(typeof arg === "object" && arg.types ? [...arg.types] : []);
      transition.ready
        .then(() => {
          for (const animation of document.getAnimations()) {
            const effect = animation.effect;
            if (!(animation instanceof CSSAnimation) || !(effect instanceof KeyframeEffect)) continue;
            const pseudo = effect.pseudoElement;
            if (!pseudo?.startsWith("::view-transition")) continue;
            const transforms: string[] = [];
            for (const frame of effect.getKeyframes()) {
              if (typeof frame.transform === "string" && frame.transform !== "none") transforms.push(frame.transform);
            }
            record.animations.push({ name: animation.animationName, pseudo, transforms });
          }
        })
        .catch(() => undefined);
      return transition;
    };
  });
}

async function transitionsAfter(page: Page, action: () => Promise<unknown>) {
  const before = await page.evaluate(() => window.__vt.types.length);
  await page.evaluate(() => {
    window.__vt.animations.length = 0;
  });
  await action();
  await expect.poll(() => page.evaluate(() => window.__vt.types.length)).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => window.__vt.animations.length)).toBeGreaterThan(0);
  const recorded = await page.evaluate(() => window.__vt);
  return { types: recorded.types.slice(before).flat(), animations: recorded.animations };
}

function shellAnimations(animations: readonly Recorded[]): Recorded[] {
  return animations.filter(({ pseudo }) => /app-sidebar|tab-bar|\(root\)/.test(pseudo));
}

function names(animations: readonly Recorded[]): string[] {
  return animations.map(({ name }) => name);
}

function transformsOf(animations: readonly Recorded[]): string[] {
  return animations.flatMap(({ transforms }) => transforms);
}

function sectionLink(page: Page, name: RegExp) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
}

test("switching sections crossfades the page and leaves the shell still", async ({ page, signIn }) => {
  await recordTransitions(page);
  await signIn("admin");
  await page.goto("/");
  await expect(page.getByTestId("kpi-active")).toBeVisible();

  const { types, animations } = await transitionsAfter(page, () => sectionLink(page, /Yard/).click());

  expect(types).toEqual([]);
  expect(names(animations)).toEqual(expect.arrayContaining(["view-fade-in", "view-fade-out"]));
  expect(transformsOf(animations)).toEqual([]);
  expect(shellAnimations(animations)).toEqual([]);
});

test("opening a customer slides in from the right and going back to the list slides out", async ({
  page,
  signIn,
}, info) => {
  await recordTransitions(page);
  await signIn("admin");
  await page.goto("/customers");
  const row = page.getByTestId("customer-row").filter({ hasText: "Murugan" });
  await expect(row).toBeVisible();

  const opened = await transitionsAfter(page, () => row.click());
  expect(opened.types).toEqual(["nav-forward"]);
  expect(names(opened.animations)).toEqual(expect.arrayContaining(["view-slide-in", "view-slide-out"]));
  expect(transformsOf(opened.animations).length).toBeGreaterThan(0);
  expect(shellAnimations(opened.animations)).toEqual([]);
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();

  test.skip(info.project.name !== "desktop", "the Customers link is behind the More sheet on mobile");
  const back = await transitionsAfter(page, () => sectionLink(page, /Customers/).click());
  expect(back.types).toEqual(["nav-back"]);
  expect(names(back.animations)).toEqual(expect.arrayContaining(["view-slide-in", "view-slide-out"]));
  expect(shellAnimations(back.animations)).toEqual([]);
});

test("browser back plays no directional animation", async ({ page, signIn }) => {
  await recordTransitions(page);
  await signIn("admin");
  await page.goto("/customers");
  await page.getByTestId("customer-row").filter({ hasText: "Murugan" }).click();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();
  const before = await page.evaluate(() => window.__vt.types.length);
  await page.evaluate(() => {
    window.__vt.animations.length = 0;
  });

  await page.goBack();
  await expect(page.getByTestId("customer-row").first()).toBeVisible();

  const recorded = await page.evaluate(() => window.__vt);
  expect(recorded.types.slice(before).flat()).toEqual([]);
  expect(transformsOf(recorded.animations)).toEqual([]);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("opening a customer crossfades instead of sliding", async ({ page, signIn }) => {
    await recordTransitions(page);
    await signIn("admin");
    await page.goto("/customers");
    const row = page.getByTestId("customer-row").filter({ hasText: "Murugan" });
    await expect(row).toBeVisible();

    const { types, animations } = await transitionsAfter(page, () => row.click());

    expect(types).toEqual(["nav-forward"]);
    expect(names(animations)).toEqual(expect.arrayContaining(["view-fade-in", "view-fade-out"]));
    expect(transformsOf(animations)).toEqual([]);
  });
});

async function holdNavigationRequests(page: Page, pathPattern: RegExp) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pathPattern, async (route) => {
    if (route.request().headers()["rsc"]) await released;
    await route.continue();
  });
  return release;
}

async function watchPendingMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__pendingAt = 0;
    document.addEventListener(
      "click",
      () => {
        window.__clickAt = performance.now();
      },
      { capture: true, once: true },
    );
    new MutationObserver(() => {
      if (!window.__pendingAt && document.querySelector("a [role=status]")) window.__pendingAt = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
}

test("tapping a customer row shows a pending marker before the customer renders", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  const row = page.getByTestId("customer-row").filter({ hasText: "Murugan" });
  await expect(row).toBeVisible();
  const release = await holdNavigationRequests(page, /\/customers\/[0-9a-f-]+/);
  await watchPendingMarker(page);

  await row.click();

  await expect(row.getByRole("status")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toHaveCount(0);
  const delay = await page.evaluate(() => window.__pendingAt - window.__clickAt);
  expect(delay).toBeLessThan(100);

  release();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();
});

async function avatarAtItsCentre(row: Locator) {
  return row.evaluate((link) => {
    const avatar = link.firstElementChild;
    if (!avatar) throw new Error("the row has no avatar");
    const box = avatar.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { text: avatar.textContent, topmostIsAvatar: top === avatar };
  });
}

test("a customer row shows its initials on top, idle and while the tap is pending", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  const row = page.getByTestId("customer-row").filter({ hasText: "Murugan" });
  await expect(row).toBeVisible();
  expect(await avatarAtItsCentre(row)).toEqual({ text: "MC", topmostIsAvatar: true });

  const release = await holdNavigationRequests(page, /\/customers\/[0-9a-f-]+/);
  await row.click();
  const spinner = row.getByRole("status");
  await expect(spinner).toBeVisible();
  expect(await avatarAtItsCentre(row)).toEqual({ text: "MC", topmostIsAvatar: true });
  const cover = await spinner.evaluate((icon) => getComputedStyle(icon.parentElement ?? icon).backgroundColor);
  expect(cover).not.toBe("rgba(0, 0, 0, 0)");

  release();
  await expect(page.getByRole("heading", { name: "Murugan Constructions" })).toBeVisible();
});

test("tapping a section link shows a pending marker before the section renders", async ({ page, signIn }) => {
  await signIn("admin");
  await page.goto("/customers");
  await expect(page.getByTestId("customer-row").first()).toBeVisible();
  const release = await holdNavigationRequests(page, /\/inward/);
  await watchPendingMarker(page);

  const link = sectionLink(page, /Inward/);
  await link.click();

  await expect(link.getByRole("status")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Log New Purchase" })).toHaveCount(0);
  const delay = await page.evaluate(() => window.__pendingAt - window.__clickAt);
  expect(delay).toBeLessThan(100);

  release();
  await expect(page.getByRole("heading", { name: "Log New Purchase" })).toBeVisible();
});

test("a toast does not overlap the offline banner", async ({ page, context, signIn }) => {
  await signIn("admin");
  await page.goto("/yard?slot=4FT");
  const card = page.getByTestId("yard-batch").filter({ hasText: "BP-OLD-01" });
  const archive = card.getByRole("button", { name: "Archive BP-OLD-01", exact: true });
  await expect(async () => {
    if (await archive.isVisible()) await archive.click();
    await expect(page.getByText("Batch BP-OLD-01 archived")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await context.setOffline(true);
  const banner = page.getByText("You are offline");
  await expect(banner).toBeVisible();

  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  await expect
    .poll(async () => {
      const [bannerBox, toastBox] = await Promise.all([banner.boundingBox(), toast.boundingBox()]);
      if (!bannerBox || !toastBox) return null;
      return toastBox.y >= bannerBox.y + bannerBox.height;
    })
    .toBe(true);
});

async function watchToastAgainstBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames = { withBoth: 0, overlapping: 0 };
    window.__toastFrames = frames;
    const sample = () => {
      const banner = document.querySelector("[data-offline-banner]");
      const toast = document.querySelector("[data-sonner-toast]");
      if (banner && toast) {
        frames.withBoth += 1;
        const a = banner.getBoundingClientRect();
        const b = toast.getBoundingClientRect();
        if (b.top < a.bottom && b.bottom > a.top) frames.overlapping += 1;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function failCopy(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
  });
}

test("a toast that arrives while the offline banner shows never overlaps it", async ({ page, context, signIn }) => {
  await signIn("admin");
  await page.goto("/public-link");
  await failCopy(page);
  await context.setOffline(true);
  await expect(page.getByText("You are offline")).toBeVisible();
  await watchToastAgainstBanner(page);

  await page.getByRole("button", { name: "Copy Link" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  await expect.poll(async () => (await toast.boundingBox())?.y).toBeGreaterThanOrEqual(52);

  await expect.poll(() => page.evaluate(() => window.__toastFrames.withBoth)).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.__toastFrames.overlapping)).toBe(0);
});

test("a toast already on screen when the browser goes offline never overlaps the banner", async ({
  page,
  context,
  signIn,
}) => {
  await signIn("admin");
  await page.goto("/public-link");
  await failCopy(page);
  await page.getByRole("button", { name: "Copy Link" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  const restingTop = (page.viewportSize()?.width ?? 0) < 600 ? 16 : 24;
  await expect.poll(async () => (await toast.boundingBox())?.y).toBe(restingTop);
  await watchToastAgainstBanner(page);

  await context.setOffline(true);
  await expect(page.getByText("You are offline")).toBeVisible();
  await expect.poll(async () => (await toast.boundingBox())?.y).toBeGreaterThanOrEqual(52);

  await expect.poll(() => page.evaluate(() => window.__toastFrames.withBoth)).toBeGreaterThan(30);
  expect(await page.evaluate(() => window.__toastFrames.overlapping)).toBe(0);
});

test("under reduced motion a toast still fades in without moving", async ({ page, signIn }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn("admin");
  await page.goto("/public-link");
  await failCopy(page);
  await page.getByRole("button", { name: "Copy Link" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  const transition = await toast.evaluate((node) => getComputedStyle(node).transitionProperty);
  expect(transition).toBe("opacity");
});
