export type NamedCustomer = { readonly id: string; readonly name: string };

const ALIAS_LENGTH = 6;
const aliasSource = `C-[0-9a-f]{${ALIAS_LENGTH}}`;
const aliasPattern = new RegExp(`\\bC-([0-9a-f]{${ALIAS_LENGTH}})\\b`, "g");

export function customerAlias(id: string): string {
  return `C-${id.slice(0, ALIAS_LENGTH)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spacedPattern(name: string): string {
  return name.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
}

export function aliasCustomerNames(text: string, customers: readonly NamedCustomer[]): string {
  const named = customers.filter((c) => c.name.trim() !== "").toSorted((a, b) => b.name.length - a.name.length);
  if (named.length === 0) return text;
  const branches = [`(${aliasSource})`, ...named.map((c) => `(${spacedPattern(c.name)})`)];
  const names = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${branches.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  return text.replace(names, (match, ...groups: (string | undefined)[]) => {
    const hit = groups.slice(0, branches.length).findIndex((group) => group !== undefined);
    return hit === 0 ? match : customerAlias(named[hit - 1].id);
  });
}

export function createDealiaser(customers: readonly NamedCustomer[]): (text: string) => string {
  const names = new Map(customers.map((c) => [customerAlias(c.id), c.name]));
  return (text) => text.replace(aliasPattern, (alias) => names.get(alias) ?? alias);
}

export function maskAliases(text: string, replacement: string): string {
  return text.replace(aliasPattern, () => replacement);
}
