package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.util.ClassUtils;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import stirling.software.proprietary.security.configuration.DatabaseConfig;

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
 * {@link #mappedPackages()}. Note this only enforces one direction — {@link SaasSchemaOwnership}
 * documents the drift it cannot see.
 */
class SaasSchemaOwnershipTest {

    /**
     * The packages the running app actually maps, read off the two {@code @EntityScan} declarations
     * that define them rather than hardcoded.
     *
     * <p>Scanning all of {@code stirling.software} would be easier and wrong in a quiet way: it is
     * a superset, so it would force ownership declarations for entities Hibernate never sees and
     * let the register claim tables that do not exist as far as the SaaS app is concerned. Deriving
     * the list means this test measures the same set Hibernate does, and follows a package being
     * added or moved without anyone updating it here.
     */
    private static Set<String> mappedPackages() {
        Set<String> packages = new TreeSet<>();
        for (Class<?> config : List.of(SaasJpaConfig.class, DatabaseConfig.class)) {
            EntityScan scan = config.getAnnotation(EntityScan.class);
            assertThat(scan)
                    .as("%s must carry @EntityScan, or its entities are not mapped", config)
                    .isNotNull();
            packages.addAll(Arrays.asList(scan.value()));
        }
        return packages;
    }

    private static TreeMap<String, String> mappedTables() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        TreeMap<String, String> byTable = new TreeMap<>();
        for (String basePackage : mappedPackages()) {
            for (BeanDefinition bd : scanner.findCandidateComponents(basePackage)) {
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
        // The scan is derived from @EntityScan now, so a package quietly dropped from either
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
                        Offending tables -> entities: %s\
                        """
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
