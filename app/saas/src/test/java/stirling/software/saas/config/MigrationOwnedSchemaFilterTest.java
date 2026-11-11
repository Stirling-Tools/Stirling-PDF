package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.Properties;

import org.hibernate.mapping.Table;
import org.hibernate.tool.schema.spi.SchemaFilter;
import org.hibernate.tool.schema.spi.SchemaFilterProvider;
import org.junit.jupiter.api.Test;

/**
 * Covers {@link MigrationOwnedSchemaFilter} and, just as importantly, its wiring.
 *
 * <p>{@link SaasSchemaOwnershipTest} proves the register is complete; nothing proved the filter
 * applies it, or that Hibernate is even asking. A typo in the {@code
 * hibernate.hbm2ddl.schema_filter_provider} key, a stale fully-qualified name after a package move,
 * or a getter returning null would all leave every migration-owned table exposed to {@code
 * ddl-auto} with a fully green build. Hence the property assertion below, which is the only thing
 * here that would catch that.
 */
class MigrationOwnedSchemaFilterTest {

    private static final String FILTER_PROPERTY =
            "spring.jpa.properties.hibernate.hbm2ddl.schema_filter_provider";

    private final MigrationOwnedSchemaFilter filter = new MigrationOwnedSchemaFilter();

    /** "orm" is Hibernate's own default contributor; the value is irrelevant to the filter. */
    private static Table table(String name) {
        return new Table("orm", name);
    }

    @Test
    void migrationOwnedTablesAreHiddenFromHibernate() {
        assertThat(filter.includeTable(table("teams"))).isFalse();
        assertThat(filter.includeTable(table("users"))).isFalse();
        assertThat(filter.includeTable(table("team_memberships"))).isFalse();
        assertThat(filter.includeTable(table("payg_instance_usage"))).isFalse();
    }

    @Test
    void inheritedTablesStayUnderHibernate() {
        assertThat(filter.includeTable(table("folders"))).isTrue();
        assertThat(filter.includeTable(table("stored_files"))).isTrue();
        assertThat(filter.includeTable(table("api_keys"))).isTrue();
    }

    @Test
    void anUnknownTableIsLeftToHibernate() {
        // Fail-open is the right default: an unrecognised table is either brand new or from a
        // module
        // we do not know about, and SaasSchemaOwnershipTest is what stops it staying unrecognised.
        assertThat(filter.includeTable(table("no_such_table"))).isTrue();
    }

    @Test
    void casingDoesNotDefeatTheFilter() {
        assertThat(filter.includeTable(table("TEAMS"))).isFalse();
        assertThat(filter.includeTable(table("Team_Memberships"))).isFalse();
    }

    /**
     * Foreign keys from an inherited table into a migration-owned one survive the filter.
     *
     * <p>Worth pinning, because it is not obvious and it decides whether a preview branch keeps
     * referential integrity. {@code folders}, {@code stored_files} and {@code file_shares} all
     * reference {@code users}/{@code teams}, which the filter excludes. Hibernate 7.2's {@code
     * SchemaCreatorImpl.createForeignKeys} (and {@code AbstractSchemaMigrator.applyForeignKeys})
     * tests {@code includeTable} against the *owning* table only, then emits every foreign key on
     * it; the referenced table is never consulted. So the constraints are still created and a
     * branch matches staging.
     *
     * <p>The one thing this depends on is ordering: the referenced tables have to exist first. They
     * do, because a Supabase branch runs its migrations at build time and the app connects after.
     */
    @Test
    void foreignKeysIntoMigrationOwnedTablesAreStillEmitted() {
        assertThat(filter.includeTable(table("folders"))).isTrue();
        assertThat(filter.includeTable(table("file_shares"))).isTrue();
        assertThat(filter.includeTable(table("users"))).isFalse();
        assertThat(filter.includeTable(table("teams"))).isFalse();
    }

    @Test
    void everySchemaActionGetsTheSameFilter() {
        assertThat(filter.getCreateFilter()).isSameAs(filter);
        assertThat(filter.getMigrateFilter()).isSameAs(filter);
        assertThat(filter.getDropFilter()).isSameAs(filter);
        assertThat(filter.getTruncatorFilter()).isSameAs(filter);
        assertThat(filter.getValidateFilter()).isSameAs(filter);
    }

    @Test
    void namespacesAndSequencesAreNeverFiltered() {
        // Both share the stirling_pdf namespace, so filtering it would take the inherited tables
        // with it. Neither argument is read, so nulls are fine and keep the test free of Hibernate
        // bootstrap machinery.
        assertThat(filter.includeNamespace(null)).isTrue();
        assertThat(filter.includeSequence(null)).isTrue();
    }

    @Test
    void theFilterIsActuallyWiredIntoHibernate() throws Exception {
        Properties properties = new Properties();
        try (InputStream in = getClass().getResourceAsStream("/application-saas.properties")) {
            assertThat(in)
                    .as("application-saas.properties must be on the test classpath to check wiring")
                    .isNotNull();
            properties.load(in);
        }

        String configured = properties.getProperty(FILTER_PROPERTY);
        assertThat(configured)
                .as(
                        "%s is unset, so Hibernate installs its default filter and every"
                                + " migration-owned table is back under ddl-auto",
                        FILTER_PROPERTY)
                .isNotBlank();

        Class<?> wired = Class.forName(configured.trim());
        assertThat(SchemaFilterProvider.class)
                .as("Hibernate only accepts a SchemaFilterProvider here")
                .isAssignableFrom(wired);
        assertThat(SchemaFilter.class).isAssignableFrom(wired);
        assertThat(wired).isEqualTo(MigrationOwnedSchemaFilter.class);
    }
}
