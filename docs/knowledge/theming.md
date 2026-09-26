---
code:
  - lib/tint.ts
  - components/tint-select.tsx
  - components/theme-toggle.tsx
  - app/globals.css
  - tests/e2e/tint.spec.ts
  - tests/e2e/theme.spec.ts
---
# Theming

## Dark mode

The theme toggle flips between light and dark. Both icons render and CSS picks the visible one from the `html` class, so the server and the first client paint agree and there is no hydration flash.

## Tint

The tint is the accent colour of the app: buttons, active nav, badges and focus rings. It is stored per device in `localStorage`, like dark mode.

- Orange is the default and leaves `data-tint` off the `html` element, so a device that never chose a tint paints exactly as before the setting existed. The other tints are CSS overrides keyed by that attribute. In `globals.css`, each tint block restates only the tokens that carry the accent; everything else comes from `:root` and `.dark`. Orange has no block on purpose.
- An inline script in `<head>` applies a saved tint before the first paint, so it never flashes orange first. It is kept as a string because it must execute before React loads, the same idea as next-themes. If storage is blocked (private mode), the tint still applies for the current page view.
- The `html` attribute is the source of truth, so components read it through `useSyncExternalStore`. The server snapshot is the default, and the browser snapshot is whatever the attribute says.

Related: [[testing]].
