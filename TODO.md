# TODO

## Performance: nodes/tokens loading

- [ ] Confirm/add `(user_id, created_at DESC)` index on the `nodes` table. Needs access
      to the schema/migrations repo (none live in phirepass-ui) to verify.
- [ ] Confirm/add `(user_id, created_at DESC)` index on the `pat_tokens` table. Same
      caveat as above.
- [ ] Replace the Redis `SCAN ... MATCH` keyspace walk in `getUserNodeStats`
      (`src/app/api/nodes/route.ts`) with a maintained per-user index (e.g. a Redis
      `SET phirepass:users:<id>:nodes` of node ids, updated when a node
      registers/deregisters) so stats lookups don't scan the entire shared keyspace.
- [ ] `pat_tokens` list query hardcodes `node_count` to `0`
      (`src/app/api/pat/list/route.ts`) — not a perf issue, but an incomplete feature
      if node counts per token are meant to be shown.
