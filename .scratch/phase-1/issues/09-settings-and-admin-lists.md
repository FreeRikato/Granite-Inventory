# 09 — Settings and admin lists

**What to build:** The Settings page shows the signed-in Team Member with a sign-out button; the Team Member list where an Admin adds a Google email with a Role or removes one; the ageing thresholds with the colour bands explained beside them; and admin lists for Products (rename, abbreviation, Category), Variants and Suppliers with rename and a delete that is refused while Batches reference the row. A removed Team Member loses access on their next request.

**Blocked by:** 03 — Yard view with ageing; 07 — Public Catalog and Public Link

**Status:** ready-for-agent

- [ ] Profile block with role badge and sign out
- [ ] Team Members: list, add (email + Role), remove; only Admin can change; removal takes effect on the next request
- [ ] Threshold editor with validation that Ageing is below Stale, and band explanation using the live values
- [ ] Products, Variants and Suppliers lists with rename; delete guarded by foreign key restriction with a friendly message
- [ ] Yard Operator sees only the profile block and sign out
- [ ] Seam tests: operator cannot write settings or team members; threshold ordering enforced; delete refused when referenced
