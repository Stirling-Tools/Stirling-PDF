package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import javax.sql.DataSource;

import org.apache.commons.lang3.tuple.Pair;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.datasource.init.CannotReadScriptException;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.FileInfo;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.database.repository.DatabaseVersionRepository;
import stirling.software.proprietary.security.model.DatabaseVersion;
import stirling.software.proprietary.security.model.exception.BackupNotFoundException;

@Slf4j
@Service
public class DatabaseService implements DatabaseServiceInterface {

    public static final String BACKUP_PREFIX = "backup_";
    public static final String SQL_SUFFIX = ".sql";
    private final Path BACKUP_DIR;

    private final ApplicationProperties.Datasource datasourceProps;
    private final DataSource dataSource;

    private final DatabaseVersionRepository databaseVersion;
    private String appVersion;

    public DatabaseService(
            ApplicationProperties.Datasource datasourceProps,
            DataSource dataSource,
            DatabaseVersionRepository databaseVersion,
            @Qualifier("appVersion") String appVersion) {
        this.BACKUP_DIR = Paths.get(InstallationPathConfig.getBackupPath()).normalize();
        this.datasourceProps = datasourceProps;
        this.dataSource = dataSource;
        this.databaseVersion = databaseVersion;
        this.appVersion = appVersion;
        moveBackupFiles();
    }

    /** Move all backup files from db/backup to backup/db */
    private void moveBackupFiles() {
        Path sourceDir =
                Paths.get(InstallationPathConfig.getConfigPath(), "db", "backup").normalize();

        if (!Files.exists(sourceDir)) {
            log.info("Source directory does not exist: {}", sourceDir);
            return;
        }

        try {
            Files.createDirectories(BACKUP_DIR);
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(sourceDir)) {
                for (Path entry : stream) {
                    if (entry.getFileName().toString().startsWith(BACKUP_PREFIX)
                            && entry.getFileName().toString().endsWith(SQL_SUFFIX)) {
                        Files.move(
                                entry,
                                BACKUP_DIR.resolve(entry.getFileName()),
                                StandardCopyOption.REPLACE_EXISTING);
                    }
                }
            }
        } catch (IOException e) {
            log.error("Error moving backup files: {}", e.getMessage(), e);
        }
    }

    /**
     * Checks if there is at least one backup. First checks if the directory exists, then checks if
     * there are backup scripts within the directory
     *
     * @return true if there are backup scripts, false if there are not
     */
    @Override
    public boolean hasBackup() {
        createBackupDirectory();

        if (Files.exists(BACKUP_DIR)) {
            return !getBackupList().isEmpty();
        }

        return false;
    }

    /**
     * Read the backup directory and filter for files with the prefix "backup_" and suffix ".sql"
     *
     * @return a <code>List</code> of backup files
     */
    @Override
    public List<FileInfo> getBackupList() {
        List<FileInfo> backupFiles = new ArrayList<>();

        if (isH2Database()) {
            createBackupDirectory();

            try (DirectoryStream<Path> stream =
                    Files.newDirectoryStream(
                            BACKUP_DIR,
                            path ->
                                    path.getFileName().toString().startsWith(BACKUP_PREFIX)
                                            && path.getFileName()
                                                    .toString()
                                                    .endsWith(SQL_SUFFIX))) {
                for (Path entry : stream) {
                    BasicFileAttributes attrs =
                            Files.readAttributes(entry, BasicFileAttributes.class);
                    LocalDateTime modificationDate =
                            LocalDateTime.ofInstant(
                                    attrs.lastModifiedTime().toInstant(), ZoneId.systemDefault());
                    LocalDateTime creationDate =
                            LocalDateTime.ofInstant(
                                    attrs.creationTime().toInstant(), ZoneId.systemDefault());
                    long fileSize = attrs.size();
                    backupFiles.add(
                            new FileInfo(
                                    entry.getFileName().toString(),
                                    entry.toString(),
                                    modificationDate,
                                    fileSize,
                                    creationDate));
                }
            } catch (IOException e) {
                log.error("Error reading backup directory: {}", e.getMessage(), e);
            }
        }

        return backupFiles;
    }

    private void createBackupDirectory() {
        if (!Files.exists(BACKUP_DIR)) {
            try {
                Files.createDirectories(BACKUP_DIR);
                log.debug("create backup directory: {}", BACKUP_DIR);
            } catch (IOException e) {
                log.error("Error create backup directory: {}", e.getMessage(), e);
            }
        }
    }

    @Override
    public void importDatabase() {
        if (!hasBackup()) throw new BackupNotFoundException("No backup scripts were found.");

        List<FileInfo> backupList = this.getBackupList();
        backupList.sort(Comparator.comparing(FileInfo::getModificationDate).reversed());

        Path latestExport = Paths.get(backupList.get(0).getFilePath());

        executeDatabaseScript(latestExport);
    }

    /** Imports a database backup from the specified file. */
    public boolean importDatabaseFromUI(String fileName) {
        try {
            importDatabaseFromUI(getBackupFilePath(fileName));
            return true;
        } catch (IOException e) {
            log.error(
                    "Error importing database from file: {}, message: {}",
                    fileName,
                    e.getMessage(),
                    e.getCause());
            return false;
        }
    }

    /** Imports a database backup from the specified path. */
    public boolean importDatabaseFromUI(Path tempTemplatePath) throws IOException {
        executeDatabaseScript(tempTemplatePath);
        LocalDateTime dateNow = LocalDateTime.now();
        DateTimeFormatter myFormatObj = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        Path insertOutputFilePath =
                this.getBackupFilePath(
                        BACKUP_PREFIX + "user_" + dateNow.format(myFormatObj) + SQL_SUFFIX);
        Files.copy(tempTemplatePath, insertOutputFilePath);
        Files.deleteIfExists(tempTemplatePath);
        return true;
    }

    @Override
    public void exportDatabase() {
        List<FileInfo> filteredBackupList =
                this.getBackupList().stream()
                        .filter(backup -> !backup.getFileName().startsWith(BACKUP_PREFIX + "user_"))
                        .collect(Collectors.toList());

        if (filteredBackupList.size() > 5) {
            deleteOldestBackup(filteredBackupList);
        }

        LocalDateTime dateNow = LocalDateTime.now();
        DateTimeFormatter myFormatObj = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        Path insertOutputFilePath =
                this.getBackupFilePath(BACKUP_PREFIX + dateNow.format(myFormatObj) + SQL_SUFFIX);

        if (isH2Database()) {
            String query = "SCRIPT SIMPLE COLUMNS DROP to ?;";

            try (Connection conn = dataSource.getConnection();
                    PreparedStatement stmt = conn.prepareStatement(query)) {
                stmt.setString(1, insertOutputFilePath.toString());
                stmt.execute();
            } catch (SQLException e) {
                log.error("Error during database export: {}", e.getMessage(), e);
            } catch (CannotReadScriptException e) {
                log.error("Error during database export: File {} not found", insertOutputFilePath);
            }

            log.info("Database export completed: {}", insertOutputFilePath);
        }
    }

    @Override
    public List<Pair<FileInfo, Boolean>> deleteAllBackups() {
        List<FileInfo> backupList = this.getBackupList();
        List<Pair<FileInfo, Boolean>> deletedFiles = new ArrayList<>();

        for (FileInfo backup : backupList) {
            try {
                Files.deleteIfExists(Paths.get(backup.getFilePath()));
                deletedFiles.add(Pair.of(backup, true));
            } catch (IOException e) {
                log.error("Error deleting backup file: {}", backup.getFileName(), e);
                deletedFiles.add(Pair.of(backup, false));
            }
        }
        return deletedFiles;
    }

    @Override
    public List<Pair<FileInfo, Boolean>> deleteLastBackup() {

        List<FileInfo> backupList = this.getBackupList();
        List<Pair<FileInfo, Boolean>> deletedFiles = new ArrayList<>();
        if (!backupList.isEmpty()) {
            FileInfo lastBackup = backupList.get(backupList.size() - 1);
            try {
                Files.deleteIfExists(Paths.get(lastBackup.getFilePath()));
                deletedFiles.add(Pair.of(lastBackup, true));
            } catch (IOException e) {
                log.error("Error deleting last backup file: {}", lastBackup.getFileName(), e);
                deletedFiles.add(Pair.of(lastBackup, false));
            }
        }
        return deletedFiles;
    }

    /**
     * Deletes the oldest backup file from the specified list.
     *
     * @param filteredBackupList the list of backup files
     */
    private static void deleteOldestBackup(List<FileInfo> filteredBackupList) {
        try {
            filteredBackupList.sort(
                    Comparator.comparing(
                            p -> p.getFileName().substring(7, p.getFileName().length() - 4)));

            FileInfo oldestFile = filteredBackupList.get(0);
            Files.deleteIfExists(Paths.get(oldestFile.getFilePath()));
            log.info("Deleted oldest backup: {}", oldestFile.getFileName());
        } catch (IOException e) {
            log.error("Unable to delete oldest backup, message: {}", e.getMessage(), e);
        }
    }

    /**
     * Retrieves the H2 database version.
     *
     * @return <code>String</code> of the H2 version
     */
    public String getH2Version() {
        String version = "Unknown";

        if (isH2Database()) {
            try (Connection conn = dataSource.getConnection()) {
                try (Statement stmt = conn.createStatement();
                        ResultSet rs = stmt.executeQuery("SELECT H2VERSION() AS version")) {
                    if (rs.next()) {
                        version = rs.getString("version");
                        log.info("H2 Database Version: {}", version);
                    }
                }
            } catch (SQLException e) {
                log.error("Error retrieving H2 version: {}", e.getMessage(), e);
            }
        }

        return version;
    }

    /*
     * Checks if the current datasource is H2.
     *
     * @return true if the datasource is H2, false otherwise
     */
    private boolean isH2Database() {
        boolean isTypeH2 =
                datasourceProps.getType().equalsIgnoreCase(ApplicationProperties.Driver.H2.name());
        boolean isDBUrlH2 =
                datasourceProps.getCustomDatabaseUrl().contains("h2")
                        || datasourceProps.getCustomDatabaseUrl().contains("H2");
        boolean isCustomDatabase = datasourceProps.isEnableCustomDatabase();

        if (isCustomDatabase) {
            if (isTypeH2 && !isDBUrlH2) {
                log.warn(
                        "Datasource type is H2, but the URL does not contain 'h2'. "
                                + "Please check your configuration.");
                throw new IllegalStateException(
                        "Datasource type is H2, but the URL does not contain 'h2'. Please check"
                                + " your configuration.");
            } else if (!isTypeH2 && isDBUrlH2) {
                log.warn(
                        "Datasource URL contains 'h2', but the type is not H2. "
                                + "Please check your configuration.");
                throw new IllegalStateException(
                        "Datasource URL contains 'h2', but the type is not H2. Please check your"
                                + " configuration.");
            }
        }
        boolean isH2 = isTypeH2 && isDBUrlH2;

        return !isCustomDatabase || isH2;
    }

    /**
     * Deletes a backup file.
     *
     * @return true if successful, false if not
     */
    public boolean deleteBackupFile(String fileName) throws IOException {
        if (!isValidFileName(fileName)) {
            log.error("Invalid file name: {}", fileName);
            return false;
        }
        Path filePath = this.getBackupFilePath(fileName);
        if (Files.deleteIfExists(filePath)) {
            log.info("Deleted backup file: {}", fileName);
            return true;
        } else {
            log.error("File not found or could not be deleted: {}", fileName);
            return false;
        }
    }

    /**
     * Gets the Path for a given backup file name.
     *
     * @return the <code>Path</code> object for the given file name
     */
    public Path getBackupFilePath(String fileName) {
        createBackupDirectory();
        Path filePath = BACKUP_DIR.resolve(fileName).normalize();
        if (!filePath.startsWith(BACKUP_DIR)) {
            throw new SecurityException("Path traversal detected");
        }
        return filePath;
    }

    /**
     * Executes a database script.
     *
     * @param scriptPath the path to the script file
     */
    private void executeDatabaseScript(Path scriptPath) {
        if (isH2Database()) {
            String query = "RUNSCRIPT from ?;";

            try (Connection conn = dataSource.getConnection();
                    PreparedStatement stmt = conn.prepareStatement(query)) {
                stmt.setString(1, scriptPath.toString());
                stmt.execute();
            } catch (SQLException e) {
                log.error("Error during database import: {}", e.getMessage(), e);
            } catch (ScriptException e) {
                log.error("Error: File {} not found", scriptPath.toString(), e);
            }
        }

        log.info("Database import completed: {}", scriptPath);
    }

    /**
     * Checks for invalid characters or sequences
     *
     * @return true if it contains no invalid characters, false if it does
     */
    private boolean isValidFileName(String fileName) {
        return fileName != null
                && !fileName.contains("..")
                && !fileName.contains("/")
                && !fileName.contains("\\")
                && !fileName.contains(":")
                && !fileName.contains("*")
                && !fileName.contains("?")
                && !fileName.contains("\"")
                && !fileName.contains("<")
                && !fileName.contains(">")
                && !fileName.contains("|");
    }

    // public void upgradeFrom_0_34_0_to_x() throws Exception {
    //     try (Connection conn = dataSource.getConnection()) {
    //         conn.setAutoCommit(false);
    //         try (Statement st = conn.createStatement()) {
    //             // Tabelle anlegen
    //             st.execute(
    //                     """
    //                         CREATE TABLE IF NOT EXISTS PUBLIC.DATABASE_VERSION (
    //                             "ID" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    //                             "VERSION" VARCHAR(255)
    //                         )
    //                     """);

    //             try (ResultSet rs = st.executeQuery(selectCoalesceMax("DATABASE_VERSION", "ID")))
    // {
    //                 if (rs.next()) {
    //                     restartIdentityIfApplicable(conn, "DATABASE_VERSION", "ID",
    // rs.getLong(1));
    //                 }
    //             }
    //         }
    //         conn.commit();
    //         log.info("DATABASE_VERSION set to {}", appVersion);
    //     } catch (Exception e) {
    //         log.error("Failed to set DATABASE_VERSION to {}: {}", appVersion, e.getMessage(), e);
    //         throw e;
    //     }
    // }

    public void upgradeFrom_0_33_1_to_0_34_0() throws Exception {
        if (!hasBackup()) {
            log.info(
                    "New Database without old data, no upgrade necessary. Schema upgrade"
                            + " automatic.");
            return;
        }
        List<FileInfo> backupList = this.getBackupList();
        backupList.sort(Comparator.comparing(FileInfo::getModificationDate).reversed());

        Path latestExport = Paths.get(backupList.get(0).getFilePath()).normalize();

        log.info("latest backup for data-only import: {}", latestExport);

        try {
            String memUrl = "jdbc:h2:mem:olddb_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1";
            String memUrlEsc = memUrl.replace("'", "''");

            String createLinkedTableUsers = createLinkedTable(memUrlEsc, "USERS");
            String createLinkedTableAuthorities = createLinkedTable(memUrlEsc, "AUTHORITIES");
            String createLinkedTablePersistentLogins =
                    createLinkedTable(memUrlEsc, "PERSISTENT_LOGINS");
            String createLinkedTableSessions = createLinkedTable(memUrlEsc, "SESSIONS");
            String createLinkedTableUserSettings = createLinkedTable(memUrlEsc, "USER_SETTINGS");

            try (Connection memConn = DriverManager.getConnection(memUrl, "sa", "")) {
                // Altes Backup in die Memory-DB laden
                try (PreparedStatement ps = memConn.prepareStatement("RUNSCRIPT FROM ?")) {
                    ps.setString(1, latestExport.toAbsolutePath().toString());
                    ps.execute();
                }
                try (Connection newConn = dataSource.getConnection()) {
                    newConn.setAutoCommit(false);
                    boolean riDisabled = false;
                    try (Statement st = newConn.createStatement()) {
                        // RI sicher deaktivieren
                        st.execute("SET REFERENTIAL_INTEGRITY FALSE");
                        riDisabled = true;

                        // TEAMS absichern
                        st.execute(
                                """
                                    MERGE INTO PUBLIC.TEAMS("NAME")
                                    KEY("NAME")
                                    VALUES('Default')
                                """);
                        st.execute(
                                """
                                    MERGE INTO PUBLIC.TEAMS("NAME")
                                    KEY("NAME")
                                    VALUES('Internal')
                                """);

                        // Linked Tables erstellen
                        st.execute(createLinkedTableUsers);
                        st.execute(createLinkedTableAuthorities);
                        st.execute(createLinkedTablePersistentLogins);
                        st.execute(createLinkedTableSessions);
                        st.execute(createLinkedTableUserSettings);

                        // USERS: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.USERS ("USER_ID","API_KEY","AUTHENTICATIONTYPE","ENABLED","IS_FIRST_LOGIN",
                                                               "PASSWORD","ROLE_NAME","USERNAME","TEAM_ID")
                                    SELECT u."USER_ID", u."API_KEY", u."AUTHENTICATIONTYPE", u."ENABLED", u."IS_FIRST_LOGIN",
                                           u."PASSWORD", u."ROLE_NAME", u."USERNAME",
                                           CASE
                                             WHEN u."USERNAME"='STIRLING-PDF-BACKEND-API-USER'
                                               THEN (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Internal')
                                             ELSE (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Default')
                                           END
                                    FROM OLD_USERS u
                                    LEFT JOIN PUBLIC.USERS n ON n."USER_ID" = u."USER_ID"
                                    WHERE n."USER_ID" IS NULL
                                """);

                        // USERS: TEAM_ID nur setzen, wenn NULL
                        st.execute(
                                """
                                    UPDATE PUBLIC.USERS u
                                    SET "TEAM_ID" = CASE
                                      WHEN u."USERNAME"='STIRLING-PDF-BACKEND-API-USER'
                                        THEN (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Internal')
                                      ELSE (SELECT t."TEAM_ID" FROM PUBLIC.TEAMS t WHERE t."NAME"='Default')
                                    END
                                    WHERE u."TEAM_ID" IS NULL
                                """);

                        // AUTHORITIES: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.AUTHORITIES ("ID","AUTHORITY","USER_ID")
                                    SELECT a."ID", a."AUTHORITY", a."USER_ID"
                                    FROM OLD_AUTHORITIES a
                                    LEFT JOIN PUBLIC.AUTHORITIES n ON n."ID" = a."ID"
                                    WHERE n."ID" IS NULL
                                """);

                        // PERSISTENT_LOGINS: Insert-only
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.PERSISTENT_LOGINS ("SERIES","LAST_USED","TOKEN","USERNAME")
                                    SELECT p."SERIES", p."LAST_USED", p."TOKEN", p."USERNAME"
                                    FROM OLD_PERSISTENT_LOGINS p
                                    LEFT JOIN PUBLIC.PERSISTENT_LOGINS n ON n."SERIES" = p."SERIES"
                                    WHERE n."SERIES" IS NULL
                                """);

                        // SESSIONS: Insert-only + sicheres Kürzen
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.SESSIONS ("SESSION_ID","EXPIRED","LAST_REQUEST","PRINCIPAL_NAME")
                                    SELECT s."SESSION_ID", s."EXPIRED", s."LAST_REQUEST",
                                           CASE WHEN s."PRINCIPAL_NAME" IS NULL
                                                THEN NULL
                                                ELSE SUBSTRING(CAST(s."PRINCIPAL_NAME" AS VARCHAR(255)), 1, 255)
                                           END
                                    FROM OLD_SESSIONS s
                                    LEFT JOIN PUBLIC.SESSIONS n ON n."SESSION_ID" = s."SESSION_ID"
                                    WHERE n."SESSION_ID" IS NULL
                                """);

                        // USER_SETTINGS: Insert-only (Composite-Key)
                        st.execute(
                                """
                                    INSERT INTO PUBLIC.USER_SETTINGS ("USER_ID","SETTING_VALUE","SETTING_KEY")
                                    SELECT us."USER_ID", CAST(us."SETTING_VALUE" AS VARCHAR), us."SETTING_KEY"
                                    FROM OLD_USER_SETTINGS us
                                    LEFT JOIN PUBLIC.USER_SETTINGS n
                                      ON n."USER_ID" = us."USER_ID" AND n."SETTING_KEY" = us."SETTING_KEY"
                                    WHERE n."USER_ID" IS NULL
                                """);

                        // Identity-Sequenzen nur fortsetzen, wenn die Spalte wirklich IDENTITY ist
                        long usersNext = 1L;
                        try (ResultSet rs =
                                st.executeQuery(selectCoalesceMax("USERS", "USER_ID"))) {
                            if (rs.next()) usersNext = rs.getLong(1);
                        }
                        restartIdentityIfApplicable(newConn, "USERS", "USER_ID", usersNext);

                        long authNext = 1L;
                        try (ResultSet rs =
                                st.executeQuery(selectCoalesceMax("AUTHORITIES", "ID"))) {
                            if (rs.next()) authNext = rs.getLong(1);
                        }
                        restartIdentityIfApplicable(newConn, "AUTHORITIES", "ID", authNext);

                    } catch (Exception ex) {
                        newConn.rollback();
                        throw ex;
                    } finally {
                        // Cleanup: Linked Tables und RI wieder aktivieren – auch bei Fehlern
                        try (Statement st2 = newConn.createStatement()) {
                            st2.execute(dropLinkedTable("USERS"));
                            st2.execute(dropLinkedTable("AUTHORITIES"));
                            st2.execute(dropLinkedTable("PERSISTENT_LOGINS"));
                            st2.execute(dropLinkedTable("SESSIONS"));
                            st2.execute(dropLinkedTable("USER_SETTINGS"));
                        } catch (Exception cleanupEx) {
                            log.warn(
                                    "Cleanup (drop linked tables) failed: {}",
                                    cleanupEx.getMessage(),
                                    cleanupEx);
                        }
                        try (Statement st3 = newConn.createStatement()) {
                            if (riDisabled) st3.execute("SET REFERENTIAL_INTEGRITY TRUE");
                        } catch (Exception riEx) {
                            log.warn(
                                    "Re-enabling referential integrity failed: {}",
                                    riEx.getMessage(),
                                    riEx);
                        }
                        try {
                            newConn.commit();
                        } catch (Exception commitEx) {
                            newConn.rollback();
                            throw commitEx;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Data-only import failed: {}", e.getMessage(), e);
        }
    }

    private String selectCoalesceMax(String tableName, String columnName) {
        StringBuilder sb = new StringBuilder();
        sb.append("SELECT COALESCE(MAX(\"");
        sb.append(columnName);
        sb.append("\"),0)+1 FROM PUBLIC.");
        sb.append(tableName);
        return sb.toString();
    }

    private String createLinkedTable(String memUrlEsc, String tableName) {
        StringBuilder createLinkedTable = new StringBuilder();
        createLinkedTable.append("CREATE LINKED TABLE IF NOT EXISTS OLD_");
        createLinkedTable.append(tableName);
        createLinkedTable.append(" (NULL, '");
        createLinkedTable.append(memUrlEsc);
        createLinkedTable.append("', 'sa', '', 'PUBLIC', '");
        createLinkedTable.append(tableName);
        createLinkedTable.append("');");
        return createLinkedTable.toString();
    }

    private String dropLinkedTable(String tableName) {
        return "DROP TABLE IF EXISTS OLD_" + tableName;
    }

    private String alterTableAddColumn(String tableName, String columnName, long columnDefinition) {
        StringBuilder alterTable = new StringBuilder();
        alterTable.append("ALTER TABLE PUBLIC.");
        alterTable.append(tableName);
        alterTable.append(" ALTER COLUMN ");
        alterTable.append(columnName);
        alterTable.append(" RESTART WITH ");
        alterTable.append(columnDefinition);
        return alterTable.toString();
    }

    private void restartIdentityIfApplicable(
            Connection conn, String tableName, String columnName, long restartWith)
            throws SQLException {
        final String q =
                """
                    SELECT IS_IDENTITY
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_NAME=? AND COLUMN_NAME=?
                """;
        try (PreparedStatement ps = conn.prepareStatement(q)) {
            ps.setString(1, tableName);
            ps.setString(2, columnName);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next() && "YES".equalsIgnoreCase(rs.getString(1))) {
                    try (Statement st = conn.createStatement()) {
                        st.execute(alterTableAddColumn(tableName, columnName, restartWith));
                    }
                } else {
                    log.debug(
                            "Column {}.{} is not IDENTITY; skip RESTART WITH {}",
                            tableName,
                            columnName,
                            restartWith);
                }
            }
        }
    }

    @Override
    public void migrateDatabase() {

        DatabaseVersion v = databaseVersion.findLastByOrderByIdDesc().orElse(new DatabaseVersion());
        if (v.getVersion() == null) {
            try {
                upgradeFrom_0_33_1_to_0_34_0();
                log.info("Upgraded database from 0.33.1 to 0.34.0");
            } catch (Exception e) {
                log.error("Failed to upgrade database from 0.33.1 to 0.34.0", e);
                return;
            }
            // try {
            //     upgradeFrom_0_34_0_to_x();
            //     log.info("Upgraded database from 0.34.0 to {}", appVersion);
            // } catch (Exception e) {
            //     log.error("Failed to upgrade database from 0.34.0 to {}", appVersion, e);
            //     return;
            // }
            v.setVersion(appVersion);
            databaseVersion.save(v);
            log.info("This application will now stop to apply the database changes.");
            System.exit(0);
        }
        boolean isAppVersionHigher = GeneralUtils.isVersionHigher(appVersion, v.getVersion());
        if (isAppVersionHigher) {
            v.setVersion(appVersion);
            databaseVersion.save(v);
        }
    }
}
