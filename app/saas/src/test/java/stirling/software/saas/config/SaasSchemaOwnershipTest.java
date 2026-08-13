package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.util.ClassUtils;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Makes {@link SaasSchemaOwnership} binding rather than decorative.
 *
 * <p>Every {@code @Entity} on the SaaS classpath has to be declared as owned by either the Supabase
 * migrations or Hibernate. Adding an entity without saying which fails here, at build time, instead
 * of months later on a preview branch that has no such table. That is not hypothetical: {@code
 * payg_instance_usage} shipped with an entity and no migration and went unnoticed until a branch
 * tried to use it.
 */
class SaasSchemaOwnershipTest {

    /** Every module whose entities the SaaS app maps: its own plus everything it inherits. */
    private static final String BASE_PACKAGE = "stirling.software";

    private static TreeMap<String, String> mappedTables() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        TreeMap<String, String> byTable = new TreeMap<>();
        for (BeanDefinition bd : scanner.findCandidateComponents(BASE_PACKAGE)) {
            String className = bd.getBeanClassName();
            Class<?> type;
            try {
                type =
                        ClassUtils.forName(
                                className, SaasSchemaOwnershipTest.class.getClassLoader());
            } catch (ClassNotFoundException | LinkageError e) {
                continue; // not on this module's runtime classpath; nothing to own
            }
            Table table = type.getAnnotation(Table.class);
            String name =
                    table != null && !table.name().isBlank()
                            ? table.name()
                            : camelToSnake(type.getSimpleName());
            byTable.put(name.toLowerCase(), className);
        }
        return byTable;
    }

    /** Mirrors Spring Boot's default CamelCaseToUnderscoresNamingStrategy for an unnamed @Table. */
    private static String camelToSnake(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
    }

    @Test
    void everyEntityTableIsOwnedByExactlyOneSide() {
        TreeMap<String, String> mapped = mappedTables();
        assertThat(mapped)
                .as("entity scan found nothing, so this test proves nothing")
                .isNotEmpty();

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
                                                .map(t -> t + " (" + mapped.get(t) + ")")
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
