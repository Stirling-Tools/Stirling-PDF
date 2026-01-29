# Database Migrations

This directory contains database migration scripts for Stirling-PDF.

## Automatic Migrations (Hibernate DDL Auto-Update)

Stirling-PDF uses Hibernate's `ddl-auto=update` mode (configured in `application.properties`), which automatically updates the database schema when entity classes change.

**How it works:**
- On startup, Hibernate compares entity annotations to the actual database schema
- If differences are detected, Hibernate generates and executes ALTER statements
- Changes are applied automatically without manual migration scripts

**In most cases, no manual intervention is required.**

## Manual Migrations

Some database changes require manual migration, especially when:
- Converting between complex column types (e.g., LOB to TEXT)
- Working with PostgreSQL-specific features
- Ensuring data integrity during schema changes

### When to Run Manual Migrations

Manual migrations are typically only needed when:
1. You're upgrading from an older version with known schema issues
2. You're experiencing specific database errors (e.g., LOB auto-commit errors)
3. The migration README or release notes indicate a manual migration is required

## Available Manual Migrations

### `manual_fix_lob_columns.sql`

**Problem:** Fixes the "Large Objects may not be used in auto-commit mode" error in PostgreSQL.

**Affected Versions:** Any version using `@Lob` annotations for text fields with PostgreSQL.

**When to Run:**
- **IMPORTANT: Try just restarting first!** In most cases, simply restarting with the updated code fixes the issue without this migration.
- Only run this migration if you still see errors after restarting
- If you're experiencing 500 errors on `/api/v1/proprietary/ui-data/audit-charts` or `/api/v1/proprietary/ui-data/usage-endpoint-statistics` **after** updating and restarting
- If you see errors like "org.postgresql.util.PSQLException: Large Objects may not be used in auto-commit mode" **after** updating and restarting
- **Only for PostgreSQL users** - H2 database users never need this migration

**Why it might not be needed:**
The database schema likely already uses TEXT columns (due to existing `columnDefinition = "text"` annotations). The issue was at the JPA/Hibernate level where `@Lob` caused incorrect LOB handling. Removing the `@Lob` annotation fixes the runtime behavior without requiring schema changes.

**How to Run:**

1. **Backup your database first!**
   ```bash
   # For Docker PostgreSQL:
   docker exec -t db pg_dump -U admin stirling_pdf > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Stop Stirling-PDF:**
   ```bash
   docker-compose stop stirling-pdf
   ```

3. **Run the migration:**
   ```bash
   # For Docker PostgreSQL:
   docker exec -i db psql -U admin -d stirling_pdf < app/proprietary/src/main/resources/db/migration/manual_fix_lob_columns.sql

   # For external PostgreSQL:
   psql -h your-host -U your-user -d stirling_pdf < app/proprietary/src/main/resources/db/migration/manual_fix_lob_columns.sql
   ```

4. **Start Stirling-PDF:**
   ```bash
   docker-compose start stirling-pdf
   ```

5. **Verify the fix:**
   - Navigate to Settings > Audit in the UI
   - Check that the dashboard loads without errors
   - Navigate to Settings > Usage Analytics
   - Check that statistics load without errors

**What it does:**
- Converts the `audit_events.data` column from PostgreSQL LOB type to TEXT type
- Preserves all existing audit data during conversion
- Adds comments to the columns documenting the change

**Rollback:**
If you need to rollback (not recommended), you would need to restore from your database backup.

## Future Migrations

As the project evolves, additional manual migrations may be added here. Always check the release notes and this README before upgrading.
