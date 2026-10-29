---
code:
  - app/globals.css
  - components/ui/button.tsx
  - components/ui/switch.tsx
  - components/ui/dialog.tsx
  - components/ui/alert-dialog.tsx
  - components/ui/popover.tsx
  - components/ui/select.tsx
  - components/ui/command.tsx
  - components/ui/sheet.tsx
  - components/ui/skeleton.tsx
  - components/ui/spinner.tsx
  - tests/tooling/motion.test.ts
---
# Motion

Motion in the app is quiet and fast: one set of durations and two curves, CSS only (Tailwind and `tw-animate-css`, no animation library), and nothing animates except opacity and transform. Theme switching stays instant.

## Tokens

`app/globals.css` defines them once, in a static `@theme` block so they are always emitted:

- `--motion-fast` 150ms, `--motion-base` 200ms, `--motion-slow` 300ms.
- `--motion-ease-out` for everything that moves, arriving or leaving. `--motion-ease-in` stays defined for the day something needs it, but nothing uses it: an ease-in curve starts slowly, so a closing surface sat still for its first frames and a crossfade showed both pages half visible. `tests/tooling/motion.test.ts` fails if anything references it.

Two utilities wrap them for `tw-animate-css`, which reads `--tw-duration` and `--tw-ease`:

- `motion-enter` is base duration with the ease-out curve.
- `motion-exit` is fast duration with the ease-out curve.

Put `data-open:motion-enter` and `data-closed:motion-exit` next to `animate-in` and `animate-out`. Exit is shorter than enter on purpose: a closing surface should get out of the way, an opening one should be seen arriving. A worked example: opening a dialog fades and zooms in over 200ms; closing it fades out over 150ms.

Dialog, alert dialog, popover, select, the command palette (it is a dialog) and sheet all use the pair. The bottom sheet slides from its full height (`slide-in-from-bottom`), not from 2.5rem below its resting place, so the More menu on mobile rises from the screen edge.

Button and Switch list the properties they transition (colours, border, ring, opacity, and button's press nudge). `transition-all` is banned under `components/` and `app/` because it also animates layout properties; `tests/tooling/motion.test.ts` fails on any use.

## Reduced motion

Under `prefers-reduced-motion: reduce`, `globals.css` zeroes every `tw-animate-css` slide, zoom and rotate variable with `!important`, so the enter and exit keyframes keep only their opacity change. `animate-pulse` stops, and `animate-spin` becomes a slow opacity pulse so a spinner still reads as busy without turning. A dialog under reduced motion therefore fades and never scales.

## Loading primitives

`Skeleton` is the single loading placeholder block (muted fill, pulse) and `Spinner` the single busy icon. Later changes build page skeletons and pending rows from them; do not hand-roll `animate-pulse` divs.

Related: [[theming]], [[testing]].
