# A Sale references exactly one Batch

A Sale has no line items; it is one Batch, one quantity, one Customer, one date. A customer taking stone from two Batches produces two Sales. The obvious alternative, an order with lines, was rejected for Phase 1 because every Batch has its own Landed Cost and Ageing Band, so per-Batch rows keep margin exact and keep the FIFO listing simple for non-technical operators, and multi-batch purchases are rare. If a receipt-level grouping is needed later, a nullable `receipt_id` on Sale is additive and does not change this shape.

## Addendum: Bills

That grouping now exists as a Bill. `sales.bill_id` is a nullable reference to `bills`, which holds the Customer, Sale date and Payment Mode of one purchase and no money. A Sale is still exactly one Batch, Landed Cost is still snapshotted per Sale, and margin and FIFO are unchanged per Sale. Sales recorded before Bills keep a null `bill_id`.
