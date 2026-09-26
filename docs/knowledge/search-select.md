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
- The trigger has `role="combobox"`. Radix's `PopoverTrigger` adds `aria-controls` at runtime, which is why oxlint's static `role-has-required-aria-props` check is switched off for this file ([[tooling]]).

Related: [[forms-and-components]].
