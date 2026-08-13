package stirling.software.saas.config;

import org.hibernate.boot.model.relational.Namespace;
import org.hibernate.boot.model.relational.Sequence;
import org.hibernate.mapping.Table;
import org.hibernate.tool.schema.spi.SchemaFilter;
import org.hibernate.tool.schema.spi.SchemaFilterProvider;

/**
 * Hides the migration-owned tables from Hibernate's schema management.
 *
 * <p>Wired on the SaaS profile only, via {@code hibernate.hbm2ddl.schema_filter_provider}.
 * Self-hosted is untouched: there Hibernate rightly owns everything.
 *
 * <p>Why a filter rather than simply turning {@code ddl-auto} off: the SaaS database has two
 * writers. The Supabase migrations own the SaaS tables, and Hibernate owns roughly thirty tables
 * inherited from the self-hosted app that no migration has ever created. Turn {@code ddl-auto} off
 * and a fresh preview branch is missing that second half; leave it on and Hibernate is free to
 * reconcile migration-owned tables, which is how {@code team_memberships.role} ended up widened to
 * varchar(255) and needed a migration to put back. A filter keeps the first half working and makes
 * the second impossible.
 *
 * <p>Note that this is a per-table filter, not a per-schema one. Hibernate's schema management runs
 * over every mapped entity regardless of namespace, so moving SaaS tables to their own schema would
 * not by itself keep Hibernate out of them. {@link SaasSchemaOwnership} is the register; this class
 * only applies it.
 */
public class MigrationOwnedSchemaFilter implements SchemaFilterProvider, SchemaFilter {

    /**
     * The one decision this class makes. Everything Hibernate might do to a table it does not own —
     * create, alter, drop, truncate — is refused.
     */
    @Override
    public boolean includeTable(Table table) {
        return !SaasSchemaOwnership.isMigrationOwned(table.getName());
    }

    /**
     * Namespaces are never filtered. The inherited tables and the migration-owned ones share {@code
     * stirling_pdf}, so excluding the namespace would take both with it.
     */
    @Override
    public boolean includeNamespace(Namespace namespace) {
        return true;
    }

    /**
     * Sequences are left alone. Every id here is an identity column rather than a mapped generator,
     * so there is nothing for Hibernate to create; filtering them would be dead code pretending to
     * be a safeguard.
     */
    @Override
    public boolean includeSequence(Sequence sequence) {
        return true;
    }

    @Override
    public SchemaFilter getCreateFilter() {
        return this;
    }

    @Override
    public SchemaFilter getMigrateFilter() {
        return this;
    }

    @Override
    public SchemaFilter getDropFilter() {
        return this;
    }

    @Override
    public SchemaFilter getTruncatorFilter() {
        return this;
    }

    /**
     * Validation is filtered too, which is the one debatable call here.
     *
     * <p>Letting it through would give a useful signal when a migration-owned table drifts from its
     * entity. But {@code ddl-auto=validate} fails startup, and it would fail on differences we have
     * deliberately accepted — {@code ai_create_sessions} carries columns from a reverted feature
     * that nothing maps, for instance. A boot failure over a table we have chosen not to manage is
     * noise, so the rule stays uniform: Hibernate does not concern itself with these tables at all.
     */
    @Override
    public SchemaFilter getValidateFilter() {
        return this;
    }
}
