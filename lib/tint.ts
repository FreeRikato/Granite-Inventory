export const TINTS = [
  { id: "orange", label: "Orange", swatch: "#ff8400" },
  { id: "amber", label: "Amber", swatch: "#ffb020" },
  { id: "green", label: "Green", swatch: "#3ecf6e" },
  { id: "teal", label: "Teal", swatch: "#2dd4bf" },
  { id: "blue", label: "Blue", swatch: "#4c9eff" },
  { id: "violet", label: "Violet", swatch: "#a78bfa" },
  { id: "rose", label: "Rose", swatch: "#fb7185" },
  { id: "neutral", label: "Neutral", swatch: "#8a8a86" },
] as const;

export type Tint = (typeof TINTS)[number]["id"];

export const DEFAULT_TINT: Tint = "orange";

export const TINT_STORAGE_KEY = "tint";

export function isTint(value: unknown): value is Tint {
  return TINTS.some((t) => t.id === value);
}

export const TINT_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(TINT_STORAGE_KEY)});if(t&&t!==${JSON.stringify(DEFAULT_TINT)}&&${JSON.stringify(TINTS.map((t) => t.id))}.indexOf(t)>=0)document.documentElement.setAttribute("data-tint",t)}catch(e){}})()`;

const listeners = new Set<() => void>();

export function applyTint(tint: Tint): void {
  if (tint === DEFAULT_TINT) document.documentElement.removeAttribute("data-tint");
  else document.documentElement.setAttribute("data-tint", tint);
  try {
    if (tint === DEFAULT_TINT) localStorage.removeItem(TINT_STORAGE_KEY);
    else localStorage.setItem(TINT_STORAGE_KEY, tint);
  } catch {}
  listeners.forEach((notify) => notify());
}

export const tintStore = {
  subscribe(notify: () => void): () => void {
    listeners.add(notify);
    return () => listeners.delete(notify);
  },
  getSnapshot(): Tint {
    const current = document.documentElement.getAttribute("data-tint");
    return isTint(current) ? current : DEFAULT_TINT;
  },
  getServerSnapshot: (): Tint => DEFAULT_TINT,
};
