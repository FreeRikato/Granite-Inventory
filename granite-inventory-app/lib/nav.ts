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
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", shortLabel: "Overview", icon: LayoutGrid },
  { href: "/inward", label: "Inward Stock", shortLabel: "Inward", icon: PlusCircle },
  { href: "/sell", label: "Sell Stone", shortLabel: "Sell", icon: MinusCircle },
  { href: "/yard", label: "Yard Slots", shortLabel: "Yard", icon: MapIcon },
  { href: "/customers", label: "Customers", shortLabel: "Customers", icon: Users },
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
