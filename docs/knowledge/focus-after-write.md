---
code:
  - lib/query/provider.tsx
  - components/yard/batch-actions.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
---
# Focus after a write

A dialog that closes after a write cannot choose where focus belongs at close time. The row it was opened from is still mounted for a frame or two, so it looks like a valid target, and then the refetched rows commit and take it away, leaving focus on the body.

Callers hand their choice to a helper in `lib/query/provider.tsx` instead. It runs once the invalidated queries have settled and the new rows have painted, plus one more frame for the commit the settled refetch triggers. By then a disconnected element really is gone and the caller can fall back. A deadline keeps a stalled refetch from swallowing focus altogether.

Two places need it:

- Saving a Batch edit can move the batch into another slot group, which unmounts its card and Edit button.
- Editing a Sale can move it off the customer, which unmounts the row the dialog was opened from. The opener is only focused if it is still there after the refetched rows paint.

Related: [[browser-reads]], [[corrections]].
