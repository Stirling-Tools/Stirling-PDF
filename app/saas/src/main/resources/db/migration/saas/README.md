# SaaS Flyway migrations

These are the incremental schema deltas Stirling applies **on top of** the base tables
(`users`, `teams`, …) that Supabase provisions in production. Supabase is the source of
truth for the schema; these migrations keep the Java backend and its tests in step with it.

## Naming: use a UTC timestamp, not the next integer

New migrations are named by the UTC time they were authored:

```
V<YYYYMMDDHHMMSS>__short_description.sql
```

Example:

```
V20260703143012__resource_grants.sql
```

Get the prefix with:

```bash
date -u +V%Y%m%d%H%M%S
```

### Why

The old scheme used a shared integer counter (`V25__…`, `V26__…`). Two branches in flight
each grabbed "the next number", so they collided the moment both merged — a duplicate
version or a checksum failure that broke CI. Timestamps are per-author and monotonic, so
independent branches never pick the same one (a clash needs two authors in the same second).

A 14-digit timestamp sorts numerically after the legacy integers (`26 < 20260703143012`),
so the two schemes coexist and apply in the right order.

Because merge order no longer matches version order, `spring.flyway.out-of-order=true` is set
in `application-saas.properties` — without it Flyway would reject a just-merged migration
whose timestamp predates one already applied. This is safe only because these migrations are
**additive and idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT EXISTS`). Keep new
migrations that way.

## Do not rename the existing integer-versioned files

`V2__…` through `V26__…` are already applied in deployed and dev environments and are tracked
by version in `flyway_schema_history`. Renaming them would make Flyway treat them as new
(re-run) or fail the checksum check. Leave them as-is; only new migrations use timestamps.
