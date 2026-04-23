package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;

class DatabaseServiceTest {

    @TempDir Path tempDir;

    @Mock private DatabaseNotificationServiceInterface notificationService;

    private DatabaseService databaseService;
    private ApplicationProperties.Datasource datasourceProps;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        datasourceProps = new ApplicationProperties.Datasource();
        datasourceProps.setType(ApplicationProperties.Driver.H2.name());
        datasourceProps.setCustomDatabaseUrl("jdbc:h2:mem:test");
        datasourceProps.setEnableCustomDatabase(false);

        DataSource dataSource =
                new DriverManagerDataSource(
                        "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");

        databaseService = new DatabaseService(datasourceProps, dataSource, notificationService);
        ReflectionTestUtils.setField(databaseService, "BACKUP_DIR", tempDir);
    }

    @Test
    void hasBackupReturnsFalseWhenEmpty() {
        assertThat(databaseService.hasBackup()).isFalse();
        assertThat(Files.exists(tempDir)).isTrue();
    }

    @Test
    void getBackupListReturnsEntries() throws IOException {
        Path backup =
                tempDir.resolve(
                        "backup_"
                                + LocalDateTime.now()
                                        .format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"))
                                + ".sql");
        Files.writeString(backup, "CREATE TABLE TEST(ID INT);");

        List<stirling.software.common.model.FileInfo> backups = databaseService.getBackupList();

        assertThat(backups).hasSize(1);
        assertThat(backups.get(0).getFileName()).isEqualTo(backup.getFileName().toString());
    }

    @Test
    void importDatabaseFromUICopiesBackupAndDeletesTemp() throws IOException {
        Path script = Files.createTempFile("script", ".sql");
        Files.writeString(script, "CREATE TABLE SAMPLE(ID INT PRIMARY KEY);\n");

        boolean result = databaseService.importDatabaseFromUI(script);

        assertThat(result).isTrue();
        assertThat(Files.exists(script)).isFalse();
        try (var stream = Files.list(tempDir)) {
            assertThat(stream.toList()).isNotEmpty();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void getBackupFilePathPreventsTraversal() {
        assertThatThrownBy(() -> databaseService.getBackupFilePath("../evil.sql"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void deleteBackupFileRejectsInvalidName() throws Exception {
        boolean deleted = databaseService.deleteBackupFile("..bad.sql");
        assertThat(deleted).isFalse();
    }

    @Test
    void deleteAllBackupsRemovesFiles() throws Exception {
        Path first = tempDir.resolve("backup_first.sql");
        Path second = tempDir.resolve("backup_second.sql");
        Files.writeString(first, "SELECT 1;");
        Files.writeString(second, "SELECT 1;");

        List<org.apache.commons.lang3.tuple.Pair<FileInfo, Boolean>> results =
                databaseService.deleteAllBackups();

        assertThat(results).hasSize(2);
        assertThat(results.stream().allMatch(org.apache.commons.lang3.tuple.Pair::getRight))
                .isTrue();
        assertThat(Files.exists(first)).isFalse();
        assertThat(Files.exists(second)).isFalse();
    }

    @Test
    void exportDatabaseCreatesScript() {
        databaseService.exportDatabase();

        assertThat(tempDir.toFile().list()).isNotEmpty();
        verify(notificationService)
                .notifyBackupsSuccess(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void validateSqlContentAcceptsRealH2BackupFile() throws IOException {
        String sqlContent =
                "-- H2 2.4.240; \n"
                        + "SET DB_CLOSE_DELAY -1;         \n"
                        + ";              \n"
                        + "CREATE USER IF NOT EXISTS \"SA\" SALT 'd4a7c2f9e1b5a8c3' HASH 'b8f3e6c1a9d2f7e4c5a8d1f6b3e7a2c9d0f5b8e1a4c7f2d9e6b3a1c8f5d2' ADMIN;          \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"AUDIT_EVENTS\" CASCADE;          \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"AUTHORITIES\" CASCADE;           \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"INVITE_TOKENS\" CASCADE;         \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"PERSISTENT_LOGINS\" CASCADE;     \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"SESSIONS\" CASCADE;              \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"TEAMS\" CASCADE; \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"USER_LICENSE_SETTINGS\" CASCADE; \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"USER_SETTINGS\" CASCADE;         \n"
                        + "DROP TABLE IF EXISTS \"PUBLIC\".\"USERS\" CASCADE; \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"AUDIT_EVENTS\"(\n"
                        + "    \"ID\" BIGINT GENERATED BY DEFAULT AS IDENTITY(START WITH 1) NOT NULL,\n"
                        + "    \"DATA\" CHARACTER VARYING,\n"
                        + "    \"PRINCIPAL\" CHARACTER VARYING(255),\n"
                        + "    \"TIMESTAMP\" TIMESTAMP(6) WITH TIME ZONE,\n"
                        + "    \"TYPE\" CHARACTER VARYING(255)\n"
                        + ");  \n"
                        + "ALTER TABLE \"PUBLIC\".\"AUDIT_EVENTS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_C\" PRIMARY KEY(\"ID\");  \n"
                        + "-- 0 +/- SELECT COUNT(*) FROM PUBLIC.AUDIT_EVENTS;             \n"
                        + "CREATE INDEX \"PUBLIC\".\"IDX_AUDIT_TIMESTAMP\" ON \"PUBLIC\".\"AUDIT_EVENTS\"(\"TIMESTAMP\" NULLS FIRST);               \n"
                        + "CREATE INDEX \"PUBLIC\".\"IDX_AUDIT_PRINCIPAL\" ON \"PUBLIC\".\"AUDIT_EVENTS\"(\"PRINCIPAL\" NULLS FIRST);               \n"
                        + "CREATE INDEX \"PUBLIC\".\"IDX_AUDIT_TYPE\" ON \"PUBLIC\".\"AUDIT_EVENTS\"(\"TYPE\" NULLS FIRST);         \n"
                        + "CREATE INDEX \"PUBLIC\".\"IDX_AUDIT_PRINCIPAL_TYPE\" ON \"PUBLIC\".\"AUDIT_EVENTS\"(\"PRINCIPAL\" NULLS FIRST, \"TYPE\" NULLS FIRST);      \n"
                        + "CREATE INDEX \"PUBLIC\".\"IDX_AUDIT_TYPE_TIMESTAMP\" ON \"PUBLIC\".\"AUDIT_EVENTS\"(\"TYPE\" NULLS FIRST, \"TIMESTAMP\" NULLS FIRST);      \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"AUTHORITIES\"(\n"
                        + "    \"ID\" BIGINT GENERATED BY DEFAULT AS IDENTITY(START WITH 1 RESTART WITH 3) NOT NULL,\n"
                        + "    \"AUTHORITY\" CHARACTER VARYING(255),\n"
                        + "    \"USER_ID\" BIGINT\n"
                        + ");            \n"
                        + "ALTER TABLE \"PUBLIC\".\"AUTHORITIES\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_A\" PRIMARY KEY(\"ID\");   \n"
                        + "-- 2 +/- SELECT COUNT(*) FROM PUBLIC.AUTHORITIES;              \n"
                        + "INSERT INTO \"PUBLIC\".\"AUTHORITIES\"(\"ID\", \"AUTHORITY\", \"USER_ID\") VALUES(1, 'ROLE_ADMIN', 1);   \n"
                        + "INSERT INTO \"PUBLIC\".\"AUTHORITIES\"(\"ID\", \"AUTHORITY\", \"USER_ID\") VALUES(2, 'STIRLING-PDF-BACKEND-API-USER', 2);\n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"INVITE_TOKENS\"(\n"
                        + "    \"ID\" BIGINT GENERATED BY DEFAULT AS IDENTITY(START WITH 1) NOT NULL,\n"
                        + "    \"CREATED_AT\" TIMESTAMP(6),\n"
                        + "    \"CREATED_BY\" CHARACTER VARYING(255) NOT NULL,\n"
                        + "    \"EMAIL\" CHARACTER VARYING(255),\n"
                        + "    \"EXPIRES_AT\" TIMESTAMP(6) NOT NULL,\n"
                        + "    \"ROLE\" CHARACTER VARYING(50) NOT NULL,\n"
                        + "    \"TEAM_ID\" BIGINT,\n"
                        + "    \"TOKEN\" CHARACTER VARYING(100) NOT NULL,\n"
                        + "    \"USED\" BOOLEAN NOT NULL,\n"
                        + "    \"USED_AT\" TIMESTAMP(6)\n"
                        + ");   \n"
                        + "ALTER TABLE \"PUBLIC\".\"INVITE_TOKENS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_E\" PRIMARY KEY(\"ID\"); \n"
                        + "-- 0 +/- SELECT COUNT(*) FROM PUBLIC.INVITE_TOKENS;            \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"PERSISTENT_LOGINS\"(\n"
                        + "    \"SERIES\" CHARACTER VARYING(255) NOT NULL,\n"
                        + "    \"LAST_USED\" TIMESTAMP(6) WITH TIME ZONE NOT NULL,\n"
                        + "    \"TOKEN\" CHARACTER VARYING(64) NOT NULL,\n"
                        + "    \"USERNAME\" CHARACTER VARYING(64) NOT NULL\n"
                        + ");             \n"
                        + "ALTER TABLE \"PUBLIC\".\"PERSISTENT_LOGINS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_A3\" PRIMARY KEY(\"SERIES\");        \n"
                        + "-- 0 +/- SELECT COUNT(*) FROM PUBLIC.PERSISTENT_LOGINS;        \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"SESSIONS\"(\n"
                        + "    \"SESSION_ID\" CHARACTER VARYING(255) NOT NULL,\n"
                        + "    \"EXPIRED\" BOOLEAN NOT NULL,\n"
                        + "    \"LAST_REQUEST\" TIMESTAMP(6) WITH TIME ZONE,\n"
                        + "    \"PRINCIPAL_NAME\" CHARACTER VARYING(255)\n"
                        + ");      \n"
                        + "ALTER TABLE \"PUBLIC\".\"SESSIONS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_8\" PRIMARY KEY(\"SESSION_ID\");              \n"
                        + "-- 0 +/- SELECT COUNT(*) FROM PUBLIC.SESSIONS; \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"TEAMS\"(\n"
                        + "    \"TEAM_ID\" BIGINT GENERATED BY DEFAULT AS IDENTITY(START WITH 1 RESTART WITH 3) NOT NULL,\n"
                        + "    \"NAME\" CHARACTER VARYING(255) NOT NULL\n"
                        + ");               \n"
                        + "ALTER TABLE \"PUBLIC\".\"TEAMS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_4\" PRIMARY KEY(\"TEAM_ID\");    \n"
                        + "-- 2 +/- SELECT COUNT(*) FROM PUBLIC.TEAMS;    \n"
                        + "INSERT INTO \"PUBLIC\".\"TEAMS\"(\"TEAM_ID\", \"NAME\") VALUES(1, 'Default');          \n"
                        + "INSERT INTO \"PUBLIC\".\"TEAMS\"(\"TEAM_ID\", \"NAME\") VALUES(2, 'Internal');         \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"USER_LICENSE_SETTINGS\"(\n"
                        + "    \"ID\" BIGINT NOT NULL,\n"
                        + "    \"GRANDFATHERED_USER_COUNT\" INTEGER NOT NULL,\n"
                        + "    \"GRANDFATHERED_USER_SIGNATURE\" CHARACTER VARYING(256) NOT NULL,\n"
                        + "    \"GRANDFATHERING_LOCKED\" BOOLEAN NOT NULL,\n"
                        + "    \"INTEGRITY_SALT\" CHARACTER VARYING(64) NOT NULL,\n"
                        + "    \"LICENSE_MAX_USERS\" INTEGER NOT NULL\n"
                        + ");            \n"
                        + "ALTER TABLE \"PUBLIC\".\"USER_LICENSE_SETTINGS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_9\" PRIMARY KEY(\"ID\");         \n"
                        + "-- 0 +/- SELECT COUNT(*) FROM PUBLIC.USER_LICENSE_SETTINGS;    \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"USER_SETTINGS\"(\n"
                        + "    \"USER_ID\" BIGINT NOT NULL,\n"
                        + "    \"SETTING_VALUE\" CHARACTER VARYING,\n"
                        + "    \"SETTING_KEY\" CHARACTER VARYING(255) NOT NULL\n"
                        + ");       \n"
                        + "ALTER TABLE \"PUBLIC\".\"USER_SETTINGS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_9A\" PRIMARY KEY(\"USER_ID\", \"SETTING_KEY\");            \n"
                        + "-- 4 +/- SELECT COUNT(*) FROM PUBLIC.USER_SETTINGS;            \n"
                        + "INSERT INTO \"PUBLIC\".\"USER_SETTINGS\"(\"USER_ID\", \"SETTING_VALUE\", \"SETTING_KEY\") VALUES(1, 'false', 'mfaEnabled');              \n"
                        + "INSERT INTO \"PUBLIC\".\"USER_SETTINGS\"(\"USER_ID\", \"SETTING_VALUE\", \"SETTING_KEY\") VALUES(1, 'false', 'mfaRequired');             \n"
                        + "INSERT INTO \"PUBLIC\".\"USER_SETTINGS\"(\"USER_ID\", \"SETTING_VALUE\", \"SETTING_KEY\") VALUES(2, 'false', 'mfaEnabled');              \n"
                        + "INSERT INTO \"PUBLIC\".\"USER_SETTINGS\"(\"USER_ID\", \"SETTING_VALUE\", \"SETTING_KEY\") VALUES(2, 'false', 'mfaRequired');             \n"
                        + "CREATE CACHED TABLE \"PUBLIC\".\"USERS\"(\n"
                        + "    \"USER_ID\" BIGINT GENERATED BY DEFAULT AS IDENTITY(START WITH 1 RESTART WITH 3) NOT NULL,\n"
                        + "    \"API_KEY\" CHARACTER VARYING(255),\n"
                        + "    \"AUTHENTICATIONTYPE\" CHARACTER VARYING(255),\n"
                        + "    \"CREATED_AT\" TIMESTAMP(6),\n"
                        + "    \"ENABLED\" BOOLEAN,\n"
                        + "    \"FORCE_PASSWORD_CHANGE\" BOOLEAN,\n"
                        + "    \"HAS_COMPLETED_INITIAL_SETUP\" BOOLEAN,\n"
                        + "    \"IS_FIRST_LOGIN\" BOOLEAN,\n"
                        + "    \"OAUTH_GRANDFATHERED\" BOOLEAN,\n"
                        + "    \"PASSWORD\" CHARACTER VARYING(255),\n"
                        + "    \"ROLE_NAME\" CHARACTER VARYING(255),\n"
                        + "    \"SSO_PROVIDER\" CHARACTER VARYING(255),\n"
                        + "    \"SSO_PROVIDER_ID\" CHARACTER VARYING(255),\n"
                        + "    \"UPDATED_AT\" TIMESTAMP(6),\n"
                        + "    \"USERNAME\" CHARACTER VARYING(255),\n"
                        + "    \"TEAM_ID\" BIGINT\n"
                        + ");         \n"
                        + "ALTER TABLE \"PUBLIC\".\"USERS\" ADD CONSTRAINT \"PUBLIC\".\"CONSTRAINT_4D\" PRIMARY KEY(\"USER_ID\");   \n"
                        + "-- 2 +/- SELECT COUNT(*) FROM PUBLIC.USERS;    \n"
                        + "INSERT INTO \"PUBLIC\".\"USERS\"(\"USER_ID\", \"API_KEY\", \"AUTHENTICATIONTYPE\", \"CREATED_AT\", \"ENABLED\", \"FORCE_PASSWORD_CHANGE\", \"HAS_COMPLETED_INITIAL_SETUP\", \"IS_FIRST_LOGIN\", \"OAUTH_GRANDFATHERED\", \"PASSWORD\", \"ROLE_NAME\", \"SSO_PROVIDER\", \"SSO_PROVIDER_ID\", \"UPDATED_AT\", \"USERNAME\", \"TEAM_ID\") VALUES(1, NULL, 'web', TIMESTAMP '2026-02-26 00:25:03.688329', TRUE, FALSE, FALSE, FALSE, FALSE, '$2a$10$k9mF3xL6pD8nB2v5rT1wSuZqJ4kP7mH8gN5aY3bX9cW2eR6fD9sY1', NULL, NULL, NULL, TIMESTAMP '2026-02-26 00:25:03.688365', 'ludy', 1);     \n"
                        + "INSERT INTO \"PUBLIC\".\"USERS\"(\"USER_ID\", \"API_KEY\", \"AUTHENTICATIONTYPE\", \"CREATED_AT\", \"ENABLED\", \"FORCE_PASSWORD_CHANGE\", \"HAS_COMPLETED_INITIAL_SETUP\", \"IS_FIRST_LOGIN\", \"OAUTH_GRANDFATHERED\", \"PASSWORD\", \"ROLE_NAME\", \"SSO_PROVIDER\", \"SSO_PROVIDER_ID\", \"UPDATED_AT\", \"USERNAME\", \"TEAM_ID\") VALUES(2, 'e3c7f1a9-6b2d-4f5e-8c3a-9d1b7e4f2c6a', 'web', TIMESTAMP '2026-02-26 00:25:03.845308', TRUE, FALSE, FALSE, FALSE, FALSE, '$2a$10$m7pB4qL9tF2jW5hX8vR3nUYsK1dE6cG9oP0jM3iC8lA7nZ4fT9xR2', NULL, NULL, NULL, TIMESTAMP '2026-02-26 00:25:03.914916', 'STIRLING-PDF-BACKEND-API-USER', 2);          \n"
                        + "ALTER TABLE \"PUBLIC\".\"USERS\" ADD CONSTRAINT \"PUBLIC\".\"UKR43AF9AP4EDM43MMTQ01ODDJ6\" UNIQUE NULLS DISTINCT (\"USERNAME\");         \n"
                        + "ALTER TABLE \"PUBLIC\".\"TEAMS\" ADD CONSTRAINT \"PUBLIC\".\"UKA510NO6SJWQCX153YD5SM4JRR\" UNIQUE NULLS DISTINCT (\"NAME\");             \n"
                        + "ALTER TABLE \"PUBLIC\".\"INVITE_TOKENS\" ADD CONSTRAINT \"PUBLIC\".\"UKEWCI50C0NCFIIHR2TC41NFBNF\" UNIQUE NULLS DISTINCT (\"TOKEN\");    \n"
                        + "ALTER TABLE \"PUBLIC\".\"AUTHORITIES\" ADD CONSTRAINT \"PUBLIC\".\"FKK91UPMBUEYIM93V469WJ7B2QH\" FOREIGN KEY(\"USER_ID\") REFERENCES \"PUBLIC\".\"USERS\"(\"USER_ID\") NOCHECK;\n"
                        + "ALTER TABLE \"PUBLIC\".\"USER_SETTINGS\" ADD CONSTRAINT \"PUBLIC\".\"FK8V82NJ88RMAI0NYCK19F873DW\" FOREIGN KEY(\"USER_ID\") REFERENCES \"PUBLIC\".\"USERS\"(\"USER_ID\") NOCHECK;              \n"
                        + "ALTER TABLE \"PUBLIC\".\"USERS\" ADD CONSTRAINT \"PUBLIC\".\"FKFJWS1RDRUAB2BQG7QIPOQF65R\" FOREIGN KEY(\"TEAM_ID\") REFERENCES \"PUBLIC\".\"TEAMS\"(\"TEAM_ID\") NOCHECK;      \n"
                        + "";

        Path script = Files.createTempFile("backup", ".sql");
        Files.writeString(script, sqlContent);

        boolean result = databaseService.importDatabaseFromUI(script);
        assertThat(result).isTrue();
    }
}
