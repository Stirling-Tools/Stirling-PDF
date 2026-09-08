package stirling.software.proprietary.storage.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.sql.DataSource;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Drops the value list PostgreSQL still enforces on {@code file_share_accesses.access_type} after
 * an upgrade. Installs created before {@link
 * stirling.software.proprietary.storage.model.FileShareAccessType} was persisted as plain text got
 * a {@code check (access_type in ('VIEW','DOWNLOAD'))} from {@code @Enumerated(STRING)}; {@code
 * ddl-auto=update} widens the column but never touches that constraint, so writing {@code EDIT}
 * fails on every existing PostgreSQL install until it is gone.
 *
 * <p>Runs after {@code entityManagerFactory} so Hibernate's own schema update has already been
 * applied, and during context refresh so no request can write an access row first. Other databases
 * are left alone: they express the enum as a native column type, which the same schema update does
 * rewrite.
 */
@Configuration
@DependsOn("entityManagerFactory")
@RequiredArgsConstructor
@Slf4j
public class FileShareAccessTypeSchemaRepair {

    private static final String TABLE = "file_share_accesses";
    private static final String COLUMN = "access_type";

    private static final String STALE_CHECK_CONSTRAINTS =
            "SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS definition"
                    + " FROM pg_constraint c"
                    + " JOIN pg_class t ON t.oid = c.conrelid"
                    + " JOIN pg_namespace n ON n.oid = t.relnamespace"
                    + " WHERE c.contype = 'c'"
                    + " AND t.relname = '"
                    + TABLE
                    + "'"
                    + " AND n.nspname = current_schema()"
                    + " AND pg_get_constraintdef(c.oid) LIKE '%"
                    + COLUMN
                    + "%'";

    private final DataSource dataSource;

    @PostConstruct
    void dropLegacyAccessTypeConstraints() {
        try (Connection connection = dataSource.getConnection()) {
            if (!isPostgres(connection)) {
                return;
            }
            for (String constraint : findStaleConstraints(connection)) {
                drop(connection, constraint);
            }
        } catch (SQLException e) {
            // Failing the boot would take down every unrelated feature; VIEW and DOWNLOAD still
            // work, and only collaborative saves break until an operator drops the constraint.
            log.error(
                    "Could not check {}.{} for a legacy value constraint. Collaborative saves may"
                            + " fail until it is dropped manually.",
                    TABLE,
                    COLUMN,
                    e);
        }
    }

    private static boolean isPostgres(Connection connection) throws SQLException {
        String product = connection.getMetaData().getDatabaseProductName();
        return product != null && product.toLowerCase(Locale.ROOT).contains("postgres");
    }

    private static List<String> findStaleConstraints(Connection connection) throws SQLException {
        List<String> names = new ArrayList<>();
        try (Statement statement = connection.createStatement();
                ResultSet rows = statement.executeQuery(STALE_CHECK_CONSTRAINTS)) {
            while (rows.next()) {
                names.add(rows.getString("name"));
            }
        }
        return names;
    }

    private static void drop(Connection connection, String constraint) {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate(
                    "ALTER TABLE " + TABLE + " DROP CONSTRAINT \"" + constraint + "\"");
            log.info("Dropped legacy {}.{} value constraint {}", TABLE, COLUMN, constraint);
        } catch (SQLException e) {
            log.error(
                    "Could not drop legacy {}.{} value constraint {}. Collaborative saves will fail"
                            + " until it is dropped manually.",
                    TABLE,
                    COLUMN,
                    constraint,
                    e);
        }
    }
}
