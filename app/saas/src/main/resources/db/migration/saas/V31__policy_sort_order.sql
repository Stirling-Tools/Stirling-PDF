-- Team-wide policy run order (see PolicyEntity.sortOrder). The order policies run in is stored
-- server-side and shared by the whole team (not per-user in the browser), and is admin-editable.
-- Nullable so existing rows keep working; reads treat a null as 0 (coalesce), and the store
-- appends a new policy at max(order)+1 so setting one up adds it to the end of the queue.
ALTER TABLE policies ADD COLUMN sort_order INTEGER;
