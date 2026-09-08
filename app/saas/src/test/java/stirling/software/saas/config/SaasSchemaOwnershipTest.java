package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;

/**
 * Makes {@link SaasSchemaOwnership} binding rather than decorative.
 *
 * <p>Every {@code @Entity} the SaaS app maps has to be declared as owned by either the Supabase
 * migrations or Hibernate. Adding an entity without saying which fails here, at build time, instead
 * of months later on a preview branch that has no such table. That is not hypothetical: {@code
 * payg_instance_usage} shipped with an entity and no migration and went unnoticed until a branch
 * tried to use it.
 *
 * <p>"Maps" is meant precisely: the scan covers the packages named by the {@code @EntityScan}
 * declarations the app actually boots with, not everything under {@code stirling.software}. See
 * {@link MappedEntities}. Note this only enforces one direction — {@link SaasSchemaOwnership}
 * documents the drift it cannot see, and {@link MigrationOwnedColumnsTest} covers the columns
 * within a table this one has already placed.
 */
class SaasSchemaOwnershipTest {

    @Test
    void everyEntityTableIsOwnedByExactlyOneSide() {
        TreeMap<String, Class<?>> mapped = MappedEntities.byTable();
        assertThat(mapped)
                .as("entity scan found nothing, so this test proves nothing")
                .isNotEmpty();
        // The scan is derived from @EntityScan, so a package quietly dropped from either
        // declaration would shrink it and weaken this test rather than fail it. These four straddle
        // the two declarations, so losing either side fails here instead of silently checking less.
        assertThat(mapped.keySet())
                .as("both @EntityScan declarations must have contributed to the scan")
                .contains("users", "teams", "payg_instance_usage", "folders");

        Set<String> undeclared = new TreeSet<>();
        Set<String> both = new TreeSet<>();
        for (String table : mapped.keySet()) {
            boolean migration = SaasSchemaOwnership.MIGRATION_OWNED.contains(table);
            boolean hibernate = SaasSchemaOwnership.HIBERNATE_MANAGED.contains(table);
            if (migration && hibernate) both.add(table);
            if (!migration && !hibernate) undeclared.add(table);
        }

        assertThat(undeclared)
                .as(
                        """
                        These entity tables are not declared in SaasSchemaOwnership, so nobody owns \
                        them. Decide and add each to exactly one set:
                          - MIGRATION_OWNED: also add a migration in Stirling-PDF-SaaS, or the table \
                        will not exist on a fresh preview branch.
                          - HIBERNATE_MANAGED: only correct for a table inherited from the \
                        self-hosted app that no Supabase migration creates.
                        Offending tables -> entities: %s"""
                                .formatted(
                                        undeclared.stream()
                                                .map(t -> t + " (" + mapped.get(t).getName() + ")")
                                                .toList()))
                .isEmpty();

        assertThat(both)
                .as("declared as owned by both sides, which is the one thing it cannot be")
                .isEmpty();
    }

    @Test
    void theTwoSetsDoNotOverlap() {
        Set<String> overlap = new TreeSet<>(SaasSchemaOwnership.MIGRATION_OWNED);
        overlap.retainAll(SaasSchemaOwnership.HIBERNATE_MANAGED);
        assertThat(overlap).isEmpty();
    }

    @Test
    void tableNamesAreLowercaseSoLookupsCannotMiss() {
        // isMigrationOwned() lowercases its input; a capital in either set would be unreachable.
        assertThat(SaasSchemaOwnership.MIGRATION_OWNED)
                .allSatisfy(t -> assertThat(t).isEqualTo(t.toLowerCase()));
        assertThat(SaasSchemaOwnership.HIBERNATE_MANAGED)
                .allSatisfy(t -> assertThat(t).isEqualTo(t.toLowerCase()));
    }

    @Test
    void migrationOwnedTablesIncludeTheOnesThatBitUs() {
        // team_memberships is the table an old ddl-auto run widened; payg_instance_usage is the one
        // that had an entity and no migration. Both must be on the migrations' side of the line.
        assertThat(SaasSchemaOwnership.MIGRATION_OWNED)
                .contains("team_memberships", "payg_instance_usage", "teams", "users");
    }

    @Test
    void isMigrationOwnedIsCaseInsensitiveAndNullSafe() {
        assertThat(SaasSchemaOwnership.isMigrationOwned("TEAM_MEMBERSHIPS")).isTrue();
        assertThat(SaasSchemaOwnership.isMigrationOwned("team_memberships")).isTrue();
        assertThat(SaasSchemaOwnership.isMigrationOwned(null)).isFalse();
        assertThat(SaasSchemaOwnership.isMigrationOwned("no_such_table")).isFalse();
    }
}
