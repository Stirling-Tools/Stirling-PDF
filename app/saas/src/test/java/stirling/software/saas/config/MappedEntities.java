package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.util.ClassUtils;

import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embedded;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import stirling.software.proprietary.security.configuration.DatabaseConfig;

/**
 * The entity mapping the SaaS app actually boots with, as the schema-ownership gates measure it.
 *
 * <p>Shared by {@link SaasSchemaOwnershipTest}, which asks who owns each table, and {@link
 * MigrationOwnedColumnsTest}, which asks what a migration-owned table's entity maps.
 */
final class MappedEntities {

    private MappedEntities() {}

    /**
     * The packages the running app maps, read off the two {@code @EntityScan} declarations that
     * define them rather than hardcoded.
     *
     * <p>Scanning all of {@code stirling.software} would be easier and wrong in a quiet way: it is
     * a superset, so it would force ownership declarations for entities Hibernate never sees and
     * let the register claim tables that do not exist as far as the SaaS app is concerned. Deriving
     * the list means these tests measure the same set Hibernate does, and follows a package being
     * added or moved without anyone updating it here.
     */
    static Set<String> mappedPackages() {
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

    /** Every {@code @Entity} class in the mapped packages, in a stable order. */
    static List<Class<?>> entities() {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        List<Class<?>> entities = new ArrayList<>();
        for (String basePackage : mappedPackages()) {
            for (BeanDefinition bd : scanner.findCandidateComponents(basePackage)) {
                try {
                    entities.add(
                            ClassUtils.forName(
                                    bd.getBeanClassName(), MappedEntities.class.getClassLoader()));
                } catch (ClassNotFoundException | LinkageError e) {
                    // not on this module's runtime classpath; nothing to own
                }
            }
        }
        return entities;
    }

    /** Lowercase table name to the {@code @Entity} class mapping it, schema disregarded. */
    static TreeMap<String, Class<?>> byTable() {
        TreeMap<String, Class<?>> byTable = new TreeMap<>();
        for (Class<?> entity : entities()) {
            byTable.put(tableOf(entity), entity);
        }
        return byTable;
    }

    /** The lowercase table an entity maps, without its schema. */
    static String tableOf(Class<?> entity) {
        Table table = entity.getAnnotation(Table.class);
        return (table != null && !table.name().isBlank()
                        ? table.name()
                        : camelToSnake(entity.getSimpleName()))
                .toLowerCase();
    }

    /**
     * The table an entity maps, prefixed by its schema when it declares one. Two entities can map
     * the same table name in different schemas — {@code auth.users} and {@code users} do — so this
     * is the key to use wherever they must stay apart.
     */
    static String qualifiedTableOf(Class<?> entity) {
        Table table = entity.getAnnotation(Table.class);
        String schema = table == null ? "" : table.schema();
        return schema.isBlank() ? tableOf(entity) : schema.toLowerCase() + "." + tableOf(entity);
    }

    /**
     * The column names an entity maps in its own table, derived from the mapping annotations.
     *
     * <p>Column names for unannotated properties are approximated with the same camel-to-snake rule
     * Hibernate's default naming strategy uses. Exactness is not the point: the callers compare one
     * run against a committed snapshot produced the same way, so what has to hold is that the
     * result changes when, and only when, the mapping does.
     */
    static TreeSet<String> columnsOf(Class<?> entity) {
        TreeSet<String> columns = new TreeSet<>();
        collectColumns(entity, columns);
        return columns;
    }

    private static void collectColumns(Class<?> type, Set<String> out) {
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field field : c.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) {
                    continue;
                }
                if (field.isAnnotationPresent(Transient.class)) {
                    continue;
                }
                // Held in a table of their own, so not this table's columns.
                if (field.isAnnotationPresent(OneToMany.class)
                        || field.isAnnotationPresent(ManyToMany.class)
                        || field.isAnnotationPresent(ElementCollection.class)) {
                    continue;
                }
                if (field.isAnnotationPresent(EmbeddedId.class)
                        || field.isAnnotationPresent(Embedded.class)) {
                    collectColumns(field.getType(), out);
                    continue;
                }
                JoinColumn join = field.getAnnotation(JoinColumn.class);
                if (join != null) {
                    out.add(named(join.name(), camelToSnake(field.getName()) + "_id"));
                    continue;
                }
                if (field.isAnnotationPresent(ManyToOne.class)
                        || field.isAnnotationPresent(OneToOne.class)) {
                    out.add(camelToSnake(field.getName()) + "_id");
                    continue;
                }
                Column column = field.getAnnotation(Column.class);
                out.add(named(column == null ? "" : column.name(), camelToSnake(field.getName())));
            }
        }
    }

    private static String named(String declared, String fallback) {
        return (declared.isBlank() ? fallback : declared).toLowerCase();
    }

    /** Mirrors Spring Boot's default CamelCaseToUnderscoresNamingStrategy. */
    static String camelToSnake(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
    }
}
