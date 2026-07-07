# Demo audit-log seed

Populates the `AUDIT_EVENTS` table with realistic sample data so the portal /
admin audit dashboard can be demoed live without generating traffic by hand.

Uses **only** the real `AuditEventType` values (see `AuditEventType.java`):
`USER_LOGIN, USER_LOGOUT, USER_FAILED_LOGIN, USER_PROFILE_UPDATE,
SETTINGS_CHANGED, FILE_OPERATION, PDF_PROCESS, UI_DATA, HTTP_REQUEST`.
The `data` JSON blob mirrors what the live audit pipeline writes
(`principal, timestamp, __origin, httpMethod, path, clientIp, statusCode,
latencyMs, status, files[], requestId`).

## Files

- `seed_audit_events.py` — deterministic generator → writes `seed_audit_events.sql`.
- `schema_audit_events.sql` — the `AUDIT_EVENTS` DDL (identical to Hibernate's),
  so a fresh DB can be seeded before the app's first boot.
- `seed_audit_events.sql` — generated INSERTs (regenerate any time).

## Regenerate the SQL

```bash
python scripts/demo/seed_audit_events.py --end 2026-07-07 --days 14 --count 320
```

## Apply to the local H2 dev DB

The backend's default datasource is H2 at `./configs/stirling-pdf-DB-2.3.232`
(relative to the launch dir), user `sa`, empty password. Apply with the H2 jar
from the Gradle cache (version must match the DB — 2.3.232):

```bash
H2JAR="$HOME/.gradle/caches/modules-2/files-2.1/com.h2database/h2/2.3.232/4fcc05d966ccdb2812ae8b9a718f69226c0cf4e2/h2-2.3.232.jar"
DBURL="jdbc:h2:file:$PWD/configs/stirling-pdf-DB-2.3.232;MODE=PostgreSQL"

# schema first (no-op if the app already created the table), then the rows:
java -cp "$H2JAR" org.h2.tools.RunScript -url "$DBURL" -user sa -password "" -script scripts/demo/schema_audit_events.sql
java -cp "$H2JAR" org.h2.tools.RunScript -url "$DBURL" -user sa -password "" -script scripts/demo/seed_audit_events.sql
```

Notes:
- **DB location gotcha:** `gradlew :stirling-pdf:bootRun` runs with `app/core` as its
  working dir, so its H2 DB is at **`app/core/configs/stirling-pdf-DB-2.3.232`**, NOT
  `<repo-root>/configs`. Seed the file the backend actually opens, or the rows won't
  show. (The app auto-creates the table there on first boot, so only the INSERT script
  is needed — the schema script is a no-op.)
- Rows omit `ID` so H2's IDENTITY column assigns it and stays consistent with the
  app's later real inserts.
- The DB must not be open by a running backend when you run this (H2 file locks).
- Audit endpoints are Enterprise-gated: boot the demo with an EE/premium key so
  `/api/v1/audit/*` serves this data.
