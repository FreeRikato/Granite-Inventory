import {
  Globe,
  LayoutGrid,
  MinusCircle,
  Map as MapIcon,
  PlusCircle,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/domain";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: LucideIcon;
  /* Pages whose rows come from the browser cache render an empty shell on the server, so the
     nav prefetches that shell in full and the click itself needs no server round trip. */
  readonly shell?: true;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", shortLabel: "Overview", icon: LayoutGrid, shell: true },
  { href: "/inward", label: "Inward Stock", shortLabel: "Inward", icon: PlusCircle, shell: true },
  { href: "/sell", label: "Sell Stone", shortLabel: "Sell", icon: MinusCircle, shell: true },
  { href: "/yard", label: "Yard Slots", shortLabel: "Yard", icon: MapIcon, shell: true },
  { href: "/customers", label: "Customers", shortLabel: "Customers", icon: Users, shell: true },
  { href: "/public-link", label: "Public Catalog", shortLabel: "Catalog", icon: Globe },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  shortLabel: "Settings",
  icon: Settings,
};

/* Mobile tab bar shows the first four; the rest live under More. */
export const MOBILE_TABS = NAV_ITEMS.slice(0, 4);
export const MOBILE_MORE = [...NAV_ITEMS.slice(4), SETTINGS_ITEM];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function roleLabel(role: Role): string {
  return role === "ADMIN" ? "Admin" : "Yard operator";
}
