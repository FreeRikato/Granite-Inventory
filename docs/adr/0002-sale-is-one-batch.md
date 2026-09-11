# A Sale references exactly one Batch

A Sale has no line items; it is one Batch, one quantity, one Customer, one date. A customer taking stone from two Batches produces two Sales. The obvious alternative, an order with lines, was rejected for Phase 1 because every Batch has its own Landed Cost and Ageing Band, so per-Batch rows keep margin exact and keep the FIFO listing simple for non-technical operators, and multi-batch purchases are rare. If a receipt-level grouping is needed later, a nullable `receipt_id` on Sale is additive and does not change this shape.
