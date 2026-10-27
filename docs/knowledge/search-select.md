---
code:
  - components/search-select.tsx
  - tests/seam/search-select.test.ts
---
# Search select

A searchable single select with optional inline create, built from Popover and Command (cmdk).

- One matching rule serves both the list filter and the seam tests: a case-insensitive substring of the label or a keyword, or a digit substring of the phone.
- The "Add ..." row appears only when a create handler is given. It is offered unless the query exactly matches a label or exact phone digits, so a query that only partly matches an option can still be created. The create row is never filtered out.
- cmdk hands the filter an item's value, so items carry the option id and the rule looks the option up by it.
- `optionActions` puts icon buttons (Edit, Archive, Delete on Inward) inside each option row. Each button stops the click, pointer-down and key events, so cmdk neither selects the row nor treats Enter as a selection, and it closes the popover before running the action so the dialog it opens takes focus. With actions the popover is at least 18rem wide; at the trigger's width the icons squeezed the labels out of sight.
- The trigger has `role="combobox"`. Radix's `PopoverTrigger` adds `aria-controls` at runtime, which is why oxlint's static `role-has-required-aria-props` check is switched off for this file ([[tooling]]).

Related: [[forms-and-components]].
