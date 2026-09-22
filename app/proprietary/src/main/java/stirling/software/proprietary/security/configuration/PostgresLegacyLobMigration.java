package stirling.software.proprietary.security.configuration;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Resolves legacy PostgreSQL large objects before Hibernate can cast their OIDs to text. A failed
 * conversion rolls back both columns and prevents startup; source large objects remain intact.
 */
@Slf4j
@Configuration(proxyBeanMethods = false)
@Profile("!saas")
@RequiredArgsConstructor
public class PostgresLegacyLobMigration implements HibernatePropertiesCustomizer {

    private final DataSource dataSource;

    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        try (Connection connection = dataSource.getConnection()) {
            if (!"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())) {
                return;
            }
            boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute("SELECT pg_advisory_xact_lock(23455099836321602)");
                if (hasLegacyAuditColumn(statement)) {
                    migrateSettings(statement);
                    statement.execute(
                            "ALTER TABLE audit_events ALTER COLUMN data TYPE text "
                                    + "USING convert_from(lo_get(data), 'UTF8')");
                    log.info(
                            "Converted legacy PostgreSQL settings and audit large objects to text");
                }
                connection.commit();
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            } finally {
                connection.setAutoCommit(autoCommit);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not migrate legacy PostgreSQL large objects", e);
        }
    }

    private boolean hasLegacyAuditColumn(Statement statement) throws SQLException {
        // The OID column identifies the legacy schema; modern numeric settings are ordinary text.
        try (ResultSet result =
                statement.executeQuery(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema() AND table_name = 'audit_events'
                          AND column_name = 'data' AND udt_name = 'oid'
                        """)) {
            return result.next();
        }
    }

    private void migrateSettings(Statement statement) throws SQLException {
        try (ResultSet result =
                statement.executeQuery("SELECT to_regclass('user_settings') IS NOT NULL")) {
            result.next();
            if (!result.getBoolean(1)) {
                return;
            }
        }
        try (ResultSet result =
                statement.executeQuery(
                        """
                        SELECT 1 FROM user_settings s
                        WHERE s.setting_value IS NOT NULL AND NOT EXISTS (
                            SELECT 1 FROM pg_largeobject_metadata m
                            WHERE m.oid::text = s.setting_value)
                        LIMIT 1
                        """)) {
            if (result.next()) {
                throw new SQLException("Legacy user setting references a missing large object");
            }
        }
        statement.executeUpdate(
                """
                UPDATE user_settings s
                SET setting_value = convert_from(lo_get(m.oid), 'UTF8')
                FROM pg_largeobject_metadata m WHERE s.setting_value = m.oid::text
                """);
    }
}
