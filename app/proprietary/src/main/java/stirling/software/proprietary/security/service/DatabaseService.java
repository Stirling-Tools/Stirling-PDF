package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
import java.util.UUID;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.apache.commons.lang3.tuple.Pair;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.datasource.init.CannotReadScriptException;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;
import stirling.software.proprietary.security.model.exception.BackupNotFoundException;

@Slf4j
@Service
@Profile("!saas")
public class DatabaseService implements DatabaseServiceInterface {

    public static final String BACKUP_PREFIX = "backup_";
    public static final String SQL_SUFFIX = ".sql";
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");
    // Everything H2 reads as something other than SQL code: string and $$ literals, quoted names,
    // and --, // and /* */ comments. One left-to-right pass, so whichever starts first wins, as
    // RUNSCRIPT's ScriptReader reads the script; the statement checks below are only as accurate
    // as this match. $$ opens a literal only at the start or after whitespace, as there: elsewhere
    // it is part of a name such as A$$B. Keep the quoted alternatives unrolled and possessive:
    // '(?:[^']|'')*' recurses once per character in java.util.regex and overflows the stack on
    // long values such as audit-event JSON.
    private static final Pattern NON_CODE_PATTERN =
            Pattern.compile(
                    "'[^']*+(?:''[^']*+)*+'"
                            + "|\"[^\"]*+(?:\"\"[^\"]*+)*+\""
                            + "|(?<!\\S)\\$\\$[\\s\\S]*?\\$\\$"
                            + "|--[^\r\n]*"
                            + "|//[^\r\n]*"
                            + "|/\\*[\\s\\S]*?\\*/");
    private final Path BACKUP_DIR;

    // The statements H2's SCRIPT command writes for this schema; each one in a backup must start
    // with one of these. SET MODE is deliberately absent: it changes how H2 tokenizes the rest of
    // the script, which NON_CODE_PATTERN would then no longer match.
    private static final java.util.List<Pattern> ALLOWED_STATEMENTS =
            java.util.List.of(
                    Pattern.compile("(?i)CREATE\\s+((CACHED|MEMORY)\\s+)?TABLE\\b"),
                    Pattern.compile(
                            "(?i)CREATE\\s+(UNIQUE\\s+(NULLS\\s+(NOT\\s+)?DISTINCT\\s+)?)?(HASH\\s+)?INDEX\\b"),
                    Pattern.compile("(?i)CREATE\\s+SEQUENCE\\b"),
                    Pattern.compile("(?i)CREATE\\s+SCHEMA\\b"),
                    Pattern.compile("(?i)CREATE\\s+USER\\b"),
                    Pattern.compile("(?i)ALTER\\s+TABLE\\b"),
                    Pattern.compile("(?i)ALTER\\s+SEQUENCE\\b"),
                    Pattern.compile("(?i)DROP\\s+TABLE\\b"),
                    Pattern.compile("(?i)INSERT\\s+INTO\\b"),
                    Pattern.compile(
                            "(?i)SET\\s+(DB_CLOSE_DELAY|REFERENTIAL_INTEGRITY|IGNORECASE|SCHEMA)\\b"));

    private static final java.util.List<Pattern> DENIED_PATTERNS =
            java.util.List.of(
                    Pattern.compile("(?i)\\bCREATE\\s+(FORCE\\s+)?ALIAS\\b"),
                    Pattern.compile("(?i)\\bCREATE\\s+(FORCE\\s+)?TRIGGER\\b"),
                    Pattern.compile("(?i)\\bCREATE\\s+(FORCE\\s+)?AGGREGATE\\b"),
                    Pattern.compile("(?i)\\bCREATE\\s+LINKED\\s+TABLE\\b"),
                    Pattern.compile("(?i)\\bFILE_WRITE\\s*\\("),
                    Pattern.compile("(?i)\\bFILE_READ\\s*\\("),
                    Pattern.compile("(?i)\\bCSVWRITE\\s*\\("),
                    Pattern.compile("(?i)\\bCSVREAD\\s*\\("),
                    Pattern.compile("(?i)\\bLINK_SCHEMA\\s*\\("),
                    Pattern.compile("(?i)\\bRUNSCRIPT\\b"),
                    Pattern.compile("(?i)\\bSCRIPT\\s+TO\\b"));

    private final ApplicationProperties.Datasource datasourceProps;
    private final DataSource dataSource;
    private final org.springframework.context.ApplicationEventPublisher events;
    private final DatabaseNotificationServiceInterface backupNotificationService;

    public DatabaseService(
            ApplicationProperties.Datasource datasourceProps,
            DataSource dataSource,
            DatabaseNotificationServiceInterface backupNotificationService,
            org.springframework.context.ApplicationEventPublisher events) {
        this.BACKUP_DIR = Path.of(InstallationPathConfig.getBackupPath()).normalize();
        this.datasourceProps = datasourceProps;
        this.dataSource = dataSource;
        this.events = events;
        this.backupNotificationService = backupNotificationService;
        moveBackupFiles();
    }

    /** Move all backup files from db/backup to backup/db */
    @Deprecated(since = "2.0.0", forRemoval = true)
    private void moveBackupFiles() {
        Path sourceDir =
                Path.of(InstallationPathConfig.getConfigPath(), "db", "backup").normalize();

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

        Path latestExport = Path.of(backupList.getFirst().getFilePath());

        executeDatabaseScript(latestExport);
    }

    /** Imports a database backup from the specified file. */
    public boolean importDatabaseFromUI(String fileName) {
        try {
            importDatabaseFromUI(getBackupFilePath(fileName));
            backupNotificationService.notifyImportsSuccess(
                    "Database import completed", "Import file: " + fileName);
            return true;
        } catch (IOException e) {
            log.error(
                    "Error importing database from file: {}, message: {}",
                    fileName,
                    e.getMessage(),
                    e.getCause());
            backupNotificationService.notifyImportsFailure(
                    "Database import failed",
                    "Import file: " + fileName + " Message: " + e.getMessage());
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
        events.publishEvent(new stirling.software.proprietary.service.DatabaseRestored());
        return true;
    }

    @Override
    public void exportDatabase() {
        List<FileInfo> filteredBackupList =
                new ArrayList<>(
                        this.getBackupList().stream()
                                .filter(
                                        backup ->
                                                !backup.getFileName()
                                                        .startsWith(BACKUP_PREFIX + "user_"))
                                .toList());

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
                backupNotificationService.notifyBackupsSuccess(
                        "Database backup export completed",
                        "Backup file: " + insertOutputFilePath.getFileName());
            } catch (SQLException e) {
                log.error("Error during database export: {}", e.getMessage(), e);
                backupNotificationService.notifyBackupsFailure(
                        "Database backup export failed",
                        "Backup file: "
                                + insertOutputFilePath.getFileName()
                                + " Message: "
                                + e.getMessage());
            } catch (CannotReadScriptException e) {
                log.error("Error during database export: File {} not found", insertOutputFilePath);
                backupNotificationService.notifyBackupsFailure(
                        "Database backup export failed",
                        "Error during database export: File "
                                + insertOutputFilePath.getFileName()
                                + " not found. Message: "
                                + e.getMessage());
            }

            log.info("Database export completed: {}", insertOutputFilePath);
            verifyBackup(insertOutputFilePath);
        }
    }

    private boolean verifyBackup(Path backupPath) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] content = Files.readAllBytes(backupPath);
            String checksum = bytesToHex(digest.digest(content));
            log.info("Checksum for {}: {}", backupPath.getFileName(), checksum);

            String verifyDbUrl = "jdbc:h2:mem:backupVerify_" + UUID.randomUUID();
            // Use a fresh in-memory database per verification to avoid leftover objects between
            // runs.
            try (Connection conn = DriverManager.getConnection(verifyDbUrl);
                    PreparedStatement stmt = conn.prepareStatement("RUNSCRIPT FROM ?")) {
                stmt.setString(1, backupPath.toString());
                stmt.execute();
            }
            return true;
        } catch (IOException | NoSuchAlgorithmException | SQLException e) {
            log.error("Backup verification failed for {}: {}", backupPath, e.getMessage());
        }
        return false;
    }

    private String bytesToHex(byte[] hash) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            hexString.append(String.format("%02x", b));
        }
        return hexString.toString();
    }

    @Override
    public List<Pair<FileInfo, Boolean>> deleteAllBackups() {
        List<FileInfo> backupList = this.getBackupList();
        List<Pair<FileInfo, Boolean>> deletedFiles = new ArrayList<>();

        for (FileInfo backup : backupList) {
            try {
                Files.deleteIfExists(Path.of(backup.getFilePath()));
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
            FileInfo lastBackup = backupList.getLast();
            try {
                Files.deleteIfExists(Path.of(lastBackup.getFilePath()));
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

            FileInfo oldestFile = filteredBackupList.getFirst();
            Files.deleteIfExists(Path.of(oldestFile.getFilePath()));
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
    @Override
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

    /** Returns {@code true} when the active runtime DataSource is genuinely H2. */
    private boolean isH2Database() {
        try (Connection conn = dataSource.getConnection()) {
            String product = conn.getMetaData().getDatabaseProductName();
            return product != null && product.toLowerCase().contains("h2");
        } catch (SQLException e) {
            log.warn(
                    "Could not read DatabaseMetaData to determine driver; assuming non-H2 to avoid"
                            + " issuing H2-only SQL against another database: {}",
                    e.getMessage());
            return false;
        }
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

            // Validate SQL content BEFORE execution to prevent injection attacks
            validateSqlContent(scriptPath);

            if (!verifyBackup(scriptPath)) {
                log.error("Backup verification failed for: {}", scriptPath);
                throw new IllegalArgumentException("Backup verification failed for: " + scriptPath);
            }

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
     * Validates SQL content to prevent execution of dangerous functions. Uses an allowlist approach
     * - only allows standard DML/DDL operations generated by H2's SCRIPT command.
     *
     * @param scriptPath the path to the SQL file
     * @throws IllegalArgumentException if dangerous SQL or disallowed patterns are detected
     */
    private void validateSqlContent(Path scriptPath) {
        try {
            String codeOnly = codeOnly(Files.readString(scriptPath));
            for (Pattern deniedPattern : DENIED_PATTERNS) {
                if (deniedPattern.matcher(codeOnly).find()) {
                    log.error(
                            "Blocked disallowed SQL in backup file matching: {}",
                            deniedPattern.pattern());
                    throw new IllegalArgumentException(
                            "SQL script contains disallowed operations and was rejected.");
                }
            }

            // Validate that content only contains allowed operations (whitelist approach)
            // Split by semicolons to check individual statements
            String[] statements = codeOnly.split(";");
            for (String statement : statements) {
                statement = statement.trim();
                if (statement.isEmpty()) {
                    continue;
                }

                String candidate = statement;
                boolean isAllowed =
                        ALLOWED_STATEMENTS.stream()
                                .anyMatch(allowed -> allowed.matcher(candidate).lookingAt());

                if (!isAllowed) {
                    log.error(
                            "Unrecognized SQL statement in backup file: {}",
                            statement.substring(0, Math.min(50, statement.length())));
                    throw new IllegalArgumentException(
                            "SQL script contains unrecognized or disallowed SQL statements. File may be"
                                    + " corrupted or tampered with.");
                }
            }

        } catch (IOException e) {
            log.error("Error reading SQL script for validation: {}", e.getMessage());
            throw new IllegalArgumentException("Failed to validate SQL script: " + e.getMessage());
        }
    }

    /**
     * The script's SQL code alone: literals blanked to {@code ''}, quoted names to {@code ""},
     * comments removed and whitespace collapsed, so the checks see neither data, nor names, nor
     * anything in a comment.
     */
    private String codeOnly(String sql) {
        // TODO: I feel like this should re-evaluated.
        // Passing around SQL like this, smells a bit when we have Hibernate/Critaria API.
        String blanked = NON_CODE_PATTERN.matcher(sql).replaceAll(match -> blank(match.group()));
        return WHITESPACE_PATTERN.matcher(blanked).replaceAll(" ").trim();
    }

    private static String blank(String nonCode) {
        return switch (nonCode.charAt(0)) {
            case '\'', '$' -> "''";
            case '"' -> "\"\"";
            default -> " ";
        };
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
}
