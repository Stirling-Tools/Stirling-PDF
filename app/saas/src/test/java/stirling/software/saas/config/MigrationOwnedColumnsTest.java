package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

/**
 * Pins the columns each migration-owned table's entity maps, which is the half {@link
 * SaasSchemaOwnershipTest} cannot see.
 *
 * <p>Once a table is on the migrations' side of the line, adding a field to its entity does not add
 * a column: {@link MigrationOwnedSchemaFilter} refuses create, alter and validate on it, and
 * staging pins {@code spring.jpa.hibernate.ddl-auto=none} besides. The column simply is not there,
 * and the first sign of it is every read of that entity failing on a SaaS deployment. Nothing else
 * here notices — the ownership test checks the table and never its columns, and the filter's whole
 * job is to stop Hibernate looking.
 *
 * <p>So the mapped column set is compared against {@code migration-owned-columns.txt}. Changing an
 * entity means editing that file in the same commit, which is where the reviewer is told that a
 * migration in Stirling-PDF-SaaS has to land first. The snapshot records what the entities map, not
 * what the database holds, so accepted drift in the other direction (columns a migration created
 * that nothing maps) never fails it.
 */
class MigrationOwnedColumnsTest {

    private static final String SNAPSHOT = "migration-owned-columns.txt";

    @Test
    void noEntityOnAMigrationOwnedTableHasChangedItsColumns() throws IOException {
        TreeMap<String, TreeSet<String>> actual = new TreeMap<>();
        for (Class<?> entity : MappedEntities.entities()) {
            if (SaasSchemaOwnership.isMigrationOwned(MappedEntities.tableOf(entity))) {
                actual.put(
                        MappedEntities.qualifiedTableOf(entity), MappedEntities.columnsOf(entity));
            }
        }

        assertThat(actual)
                .as("no migration-owned table is mapped, so this test proves nothing")
                .isNotEmpty();
        // The roster entity, whose table SaaS declares migration-owned and whose columns therefore
        // cannot be added here. Named so a scan that silently stopped finding it fails the test.
        assertThat(actual).containsKey("users");

        assertThat(render(actual))
                .as(
                        """
                        An entity on a migration-owned table no longer maps the columns %s records.

                        Hibernate cannot add or drop a column on these tables (MigrationOwnedSchemaFilter \
                        refuses create/alter/validate, and staging runs ddl-auto=none), so a column added \
                        here does not exist on SaaS until a migration in Stirling-PDF-SaaS adds it, and \
                        every read of the entity fails until then. Consider whether the state belongs on a \
                        Hibernate-managed table instead — user_settings, for one, is a collection table \
                        this filter leaves alone.

                        Once the migration is agreed, update %s to the mapping below."""
                                .formatted(SNAPSHOT, SNAPSHOT))
                .isEqualTo(snapshot());
    }

    private static String render(Map<String, TreeSet<String>> byTable) {
        StringBuilder out = new StringBuilder();
        byTable.forEach(
                (table, columns) ->
                        columns.forEach(
                                column ->
                                        out.append(table).append('.').append(column).append('\n')));
        return out.toString();
    }

    private static String snapshot() throws IOException {
        try (InputStream in =
                MigrationOwnedColumnsTest.class.getClassLoader().getResourceAsStream(SNAPSHOT)) {
            assertThat(in).as("%s is missing from the test resources", SNAPSHOT).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
