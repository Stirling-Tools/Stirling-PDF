package stirling.software.proprietary.integration.repository;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.integration.model.IntegrationType;

/**
 * Lets {@code integration_configs.integration_type} accept every {@link IntegrationType}, including
 * ones added after the table was created. Hibernate freezes the enum's values into the column when
 * it creates it (a native ENUM on H2, a CHECK constraint on PostgreSQL) and {@code ddl-auto=update}
 * never widens either, so without this a new connection type cannot be saved on an existing
 * install. Runs after schema update and before the web server starts taking requests.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class IntegrationTypeColumnWidening implements SmartInitializingSingleton {

    private final ObjectProvider<DataSource> dataSource;

    @Override
    public void afterSingletonsInstantiated() {
        DataSource source = dataSource.getIfAvailable();
        if (source == null) {
            return;
        }
        try (Connection connection = source.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            if (product.startsWith("H2")) {
                widenH2Enum(connection);
            } else if (product.startsWith("PostgreSQL")) {
                dropPostgresCheck(connection);
            }
        } catch (SQLException e) {
            log.warn(
                    "Could not widen integration_configs.integration_type; connection types added"
                            + " since this database was created may fail to save: {}",
                    e.getMessage());
        }
    }

    private static void widenH2Enum(Connection connection) throws SQLException {
        String type;
        try (PreparedStatement query =
                connection.prepareStatement(
                        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE"
                                + " TABLE_NAME = 'INTEGRATION_CONFIGS' AND COLUMN_NAME ="
                                + " 'INTEGRATION_TYPE'")) {
            try (ResultSet rows = query.executeQuery()) {
                type = rows.next() ? rows.getString(1) : null;
            }
        }
        if (!"ENUM".equalsIgnoreCase(type)) {
            return;
        }
        try (Statement alter = connection.createStatement()) {
            alter.execute(
                    "ALTER TABLE INTEGRATION_CONFIGS ALTER COLUMN INTEGRATION_TYPE SET DATA TYPE"
                            + " VARCHAR(32)");
        }
        log.info("Widened integration_configs.integration_type from ENUM to VARCHAR(32)");
    }

    private static void dropPostgresCheck(Connection connection) throws SQLException {
        List<String> constraints = new ArrayList<>();
        try (PreparedStatement query =
                connection.prepareStatement(
                        "SELECT con.conname FROM pg_constraint con WHERE con.conrelid ="
                                + " to_regclass('integration_configs') AND con.contype = 'c' AND"
                                + " pg_get_constraintdef(con.oid) LIKE '%integration_type%'")) {
            try (ResultSet rows = query.executeQuery()) {
                while (rows.next()) {
                    constraints.add(rows.getString(1));
                }
            }
        }
        for (String name : constraints) {
            try (Statement alter = connection.createStatement()) {
                alter.execute(
                        "ALTER TABLE integration_configs DROP CONSTRAINT \""
                                + name.replace("\"", "\"\"")
                                + "\"");
            }
            log.info("Dropped integration_configs CHECK constraint {}", name);
        }
    }
}
