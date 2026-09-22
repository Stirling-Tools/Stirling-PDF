package stirling.software.proprietary.security.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PostgresLegacyLobMigrationTest {

    @Container
    static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private DataSource dataSource;

    @BeforeEach
    void resetSchema() throws SQLException {
        dataSource =
                new DriverManagerDataSource(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        execute("DROP TABLE IF EXISTS user_settings, audit_events");
        execute("SELECT lo_unlink(oid) FROM pg_largeobject_metadata");
    }

    @Test
    void convertsUnicodePayloadsAndPreservesNullsAndSourceObjects() throws SQLException {
        seedLegacySchema();

        migrate();

        assertEquals(
                "Résumé Ω — setting",
                scalar("SELECT setting_value FROM user_settings WHERE user_id = 1"));
        assertEquals(
                "{\"message\":\"Résumé Ω — audit\"}",
                scalar("SELECT data FROM audit_events WHERE id = 1"));
        assertEquals("text", auditColumnType());
        assertEquals("1", scalar("SELECT count(*) FROM audit_events WHERE data IS NULL"));
        assertEquals("1", scalar("SELECT count(*) FROM user_settings WHERE setting_value IS NULL"));
        assertEquals("2", scalar("SELECT count(*) FROM pg_largeobject_metadata"));
    }

    @Test
    void repeatedStartupDoesNotInterpretModernNumericSettingsAsLargeObjects() throws SQLException {
        seedLegacySchema();
        String oldReference = scalar("SELECT setting_value FROM user_settings WHERE user_id = 1");
        migrate();
        execute(
                "UPDATE user_settings SET setting_value = '"
                        + oldReference
                        + "' WHERE user_id = 1");

        migrate();

        assertEquals(
                oldReference, scalar("SELECT setting_value FROM user_settings WHERE user_id = 1"));
    }

    @Test
    void missingAuditObjectRollsBackSettingsAndSchema() throws SQLException {
        seedLegacySchema();
        String oldReference = scalar("SELECT setting_value FROM user_settings WHERE user_id = 1");
        execute("SELECT lo_unlink(data) FROM audit_events WHERE id = 1");

        assertThrows(IllegalStateException.class, this::migrate);

        assertEquals("oid", auditColumnType());
        assertEquals(
                oldReference, scalar("SELECT setting_value FROM user_settings WHERE user_id = 1"));
    }

    @Test
    void missingSettingObjectPreventsConversion() throws SQLException {
        seedLegacySchema();
        execute("SELECT lo_unlink(setting_value::oid) FROM user_settings WHERE user_id = 1");

        assertThrows(IllegalStateException.class, this::migrate);

        assertEquals("oid", auditColumnType());
    }

    @Test
    void freshDatabaseIsUnchanged() throws SQLException {
        migrate();
        assertEquals(
                "0",
                scalar(
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"));
    }

    @Test
    void h2IsUnchanged() throws SQLException {
        dataSource =
                new DriverManagerDataSource(
                        "jdbc:h2:mem:legacy-lob-migration;DB_CLOSE_DELAY=-1", "sa", "");
        execute("CREATE TABLE IF NOT EXISTS audit_events (data VARCHAR)");
        execute("DELETE FROM audit_events");
        execute("INSERT INTO audit_events VALUES ('12345')");

        migrate();

        assertEquals("12345", scalar("SELECT data FROM audit_events"));
    }

    private void seedLegacySchema() throws SQLException {
        execute("CREATE TABLE user_settings (user_id bigint, setting_value text)");
        execute("CREATE TABLE audit_events (id bigint, data oid)");
        execute(
                "INSERT INTO user_settings VALUES (1, lo_from_bytea(0, convert_to('Résumé Ω — setting', 'UTF8'))::text), (2, NULL)");
        execute(
                "INSERT INTO audit_events VALUES (1, lo_from_bytea(0, convert_to('{\"message\":\"Résumé Ω — audit\"}', 'UTF8'))), (2, NULL)");
    }

    private void migrate() {
        new PostgresLegacyLobMigration(dataSource).customize(new HashMap<>());
    }

    private String auditColumnType() throws SQLException {
        return scalar(
                "SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'data'");
    }

    private void execute(String sql) throws SQLException {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private String scalar(String sql) throws SQLException {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getString(1);
        }
    }
}
