type NamedCustomer = { readonly id: string; readonly name: string };

const aliasPattern = /\bC-([0-9a-f]{6})\b/g;

export function createDealiaser(customers: readonly NamedCustomer[]): (text: string) => string {
  const names = new Map(customers.map((c) => [c.id.slice(0, 6), c.name]));
  return (text) => text.replace(aliasPattern, (alias, prefix: string) => names.get(prefix) ?? alias);
}
