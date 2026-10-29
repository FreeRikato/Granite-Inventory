import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(tsx?|css)$/.test(entry.name) ? [relative] : [];
  });
}

function reducedMotionBlock(): string {
  const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
  return start === -1 ? "" : css.slice(start);
}

describe("motion tokens", () => {
  it.each([
    ["--motion-fast", "150ms"],
    ["--motion-base", "200ms"],
    ["--motion-slow", "300ms"],
  ])("defines %s as %s", (token, value) => {
    expect(css).toContain(`${token}: ${value};`);
  });

  it("defines one ease-out and one ease-in curve", () => {
    expect(css).toMatch(/--motion-ease-out: cubic-bezier\([^)]+\);/);
    expect(css).toMatch(/--motion-ease-in: cubic-bezier\([^)]+\);/);
  });

  it("exposes enter and exit utilities built from the tokens", () => {
    expect(css).toMatch(/@utility motion-enter \{[^}]*var\(--motion-base\)[^}]*var\(--motion-ease-out\)/);
    expect(css).toMatch(/@utility motion-exit \{[^}]*var\(--motion-fast\)[^}]*var\(--motion-ease-out\)/);
  });

  it("keeps the ease-in token defined and uses it nowhere", () => {
    const sources = [...sourceFiles("components"), ...sourceFiles("app"), ...sourceFiles("lib")];
    const users = sources.filter(
      (file) => file !== "app/globals.css" && readFileSync(path.join(root, file), "utf8").includes("motion-ease-in"),
    );
    expect(css.match(/--motion-ease-in/g)).toHaveLength(1);
    expect(users).toEqual([]);
  });
});

describe("reduced motion", () => {
  it("has a prefers-reduced-motion block", () => {
    expect(reducedMotionBlock()).not.toBe("");
  });

  it.each([
    "--tw-enter-translate-x",
    "--tw-enter-translate-y",
    "--tw-enter-scale",
    "--tw-enter-rotate",
    "--tw-exit-translate-x",
    "--tw-exit-translate-y",
    "--tw-exit-scale",
    "--tw-exit-rotate",
  ])("neutralises %s", (variable) => {
    expect(reducedMotionBlock()).toContain(`${variable}:`);
  });

  it("stops the pulse and turns the spin into a fade", () => {
    const block = reducedMotionBlock();
    expect(block).toMatch(/\.animate-pulse \{\s*animation: none;/);
    expect(block).toMatch(/\.animate-spin \{\s*animation: motion-fade/);
  });
});

describe("transitions", () => {
  it("uses transition-all nowhere under components or app", () => {
    const offenders = [...sourceFiles("components"), ...sourceFiles("app")].filter((file) =>
      /(^|[\s"'`:])transition-all(?![\w-])/.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
