# 08 — Corrections

**What to build:** An Admin can edit or delete a Batch from its yard row and edit or delete a Sale from the customer detail page. Editing rebalances Available on every Batch involved; a change that would make Available negative, or deleting a Batch that has Sales, is refused with a clear message. Every Correction records who did it and when. A Yard Operator sees no edit or delete controls, and the functions refuse them even if called directly. Works on mobile.

**Blocked by:** 05 — Customers

**Status:** ready-for-agent

- [ ] `correct_batch`, `delete_batch`, `correct_sale`, `delete_sale` functions enforce Admin role, rebalance units sold, re-snapshot Landed Cost when a Sale moves Batch, and refuse invalid outcomes
- [ ] `updated_by` and `updated_at` set on every Correction
- [ ] Edit Batch and Edit Sale forms reuse the inward and sell form components; delete behind a confirm dialog
- [ ] Controls hidden for Yard Operator; direct function calls by a Yard Operator fail
- [ ] Seam tests: quantity edit below units sold refused; delete Batch with Sales refused; Sale moved between Batches rebalances both; Sale delete returns pieces; operator call rejected
