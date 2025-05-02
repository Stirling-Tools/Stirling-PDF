package stirling.software.SPDF.config.security.database;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.sql.Connection;
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

import org.springframework.jdbc.datasource.init.CannotReadScriptException;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.config.interfaces.DatabaseInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.exception.BackupNotFoundException;
import stirling.software.SPDF.utils.FileInfo;

@Slf4j
@Service
public class DatabaseService implements DatabaseInterface {

    public static final String BACKUP_PREFIX = "backup_";
    public static final String SQL_SUFFIX = ".sql";
    private final Path BACKUP_DIR;

    private final ApplicationProperties applicationProperties;
    private final DataSource dataSource;

    public DatabaseService(ApplicationProperties applicationProperties, DataSource dataSource) {
        this.BACKUP_DIR =
                Paths.get(InstallationPathConfig.getConfigPath(), "db", "backup").normalize();
        this.applicationProperties = applicationProperties;
        this.dataSource = dataSource;
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

    private boolean isH2Database() {
        ApplicationProperties.Datasource datasource =
                applicationProperties.getSystem().getDatasource();

        boolean isTypeH2 =
                datasource.getType().equalsIgnoreCase(ApplicationProperties.Driver.H2.name());
        boolean isDBUrlH2 =
                datasource.getCustomDatabaseUrl().contains("h2")
                        || datasource.getCustomDatabaseUrl().contains("H2");
        boolean isCustomDatabase = datasource.isEnableCustomDatabase();

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
}
