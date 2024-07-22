package stirling.software.SPDF.config.security.database;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.DatabaseBackupInterface;
import stirling.software.SPDF.utils.FileInfo;

@Slf4j
@Configuration
public class DatabaseBackupHelper implements DatabaseBackupInterface {

    @Value("${spring.datasource.url}")
    private String url;

    private Path backupPath = Paths.get("configs/db/backup/");

    @Override
    public boolean hasBackup() {
        // Check if there is at least one backup
        return !getBackupList().isEmpty();
    }

    @Override
    public List<FileInfo> getBackupList() {
        // Check if the backup directory exists, and create it if it does not
        ensureBackupDirectoryExists();

        List<FileInfo> backupFiles = new ArrayList<>();

        // Read the backup directory and filter for files with the prefix "backup_" and suffix
        // ".sql"
        try (DirectoryStream<Path> stream =
                Files.newDirectoryStream(
                        backupPath,
                        path ->
                                path.getFileName().toString().startsWith("backup_")
                                        && path.getFileName().toString().endsWith(".sql"))) {
            for (Path entry : stream) {
                BasicFileAttributes attrs = Files.readAttributes(entry, BasicFileAttributes.class);
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
        return backupFiles;
    }

    // Imports a database backup from the specified file.
    public boolean importDatabaseFromUI(String fileName) throws IOException {
        return this.importDatabaseFromUI(getBackupFilePath(fileName));
    }

    // Imports a database backup from the specified path.
    public boolean importDatabaseFromUI(Path tempTemplatePath) throws IOException {
        boolean success = executeDatabaseScript(tempTemplatePath);
        if (success) {
            LocalDateTime dateNow = LocalDateTime.now();
            DateTimeFormatter myFormatObj = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
            Path insertOutputFilePath =
                    this.getBackupFilePath("backup_user_" + dateNow.format(myFormatObj) + ".sql");
            Files.copy(tempTemplatePath, insertOutputFilePath);
            Files.deleteIfExists(tempTemplatePath);
        }
        return success;
    }

    @Override
    public boolean importDatabase() {
        if (!this.hasBackup()) return false;

        List<FileInfo> backupList = this.getBackupList();
        backupList.sort(Comparator.comparing(FileInfo::getModificationDate).reversed());

        return executeDatabaseScript(Paths.get(backupList.get(0).getFilePath()));
    }

    @Override
    public void exportDatabase() throws IOException {
        // Check if the backup directory exists, and create it if it does not
        ensureBackupDirectoryExists();

        // Filter and delete old backups if there are more than 5
        List<FileInfo> filteredBackupList =
                this.getBackupList().stream()
                        .filter(backup -> !backup.getFileName().startsWith("backup_user_"))
                        .collect(Collectors.toList());

        if (filteredBackupList.size() > 5) {
            filteredBackupList.sort(
                    Comparator.comparing(
                            p -> p.getFileName().substring(7, p.getFileName().length() - 4)));
            Files.deleteIfExists(Paths.get(filteredBackupList.get(0).getFilePath()));
            log.info("Deleted oldest backup: {}", filteredBackupList.get(0).getFileName());
        }

        LocalDateTime dateNow = LocalDateTime.now();
        DateTimeFormatter myFormatObj = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        Path insertOutputFilePath =
                this.getBackupFilePath("backup_" + dateNow.format(myFormatObj) + ".sql");
        String query = "SCRIPT SIMPLE COLUMNS DROP to ?;";

        try (Connection conn = DriverManager.getConnection(url, "sa", "");
                PreparedStatement stmt = conn.prepareStatement(query)) {
            stmt.setString(1, insertOutputFilePath.toString());
            stmt.execute();
            log.info("Database export completed: {}", insertOutputFilePath);
        } catch (SQLException e) {
            log.error("Error during database export: {}", e.getMessage(), e);
        }
    }

    // Retrieves the H2 database version.
    public String getH2Version() {
        String version = "Unknown";
        try (Connection conn = DriverManager.getConnection(url, "sa", "")) {
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
        return version;
    }

    // Deletes a backup file.
    public boolean deleteBackupFile(String fileName) throws IOException {
        Path filePath = this.getBackupFilePath(fileName);
        if (Files.deleteIfExists(filePath)) {
            log.info("Deleted backup file: {}", fileName);
            return true;
        } else {
            log.error("File not found or could not be deleted: {}", fileName);
            return false;
        }
    }

    // Gets the Path object for a given backup file name.
    public Path getBackupFilePath(String fileName) {
        return Paths.get(backupPath.toString(), fileName);
    }

    private boolean executeDatabaseScript(Path scriptPath) {
        String query = "RUNSCRIPT from ?;";

        try (Connection conn = DriverManager.getConnection(url, "sa", "");
                PreparedStatement stmt = conn.prepareStatement(query)) {
            stmt.setString(1, scriptPath.toString());
            stmt.execute();
            log.info("Database import completed: {}", scriptPath);
            return true;
        } catch (SQLException e) {
            log.error("Error during database import: {}", e.getMessage(), e);
            return false;
        }
    }

    private void ensureBackupDirectoryExists() {
        if (Files.notExists(backupPath)) {
            try {
                Files.createDirectories(backupPath);
            } catch (IOException e) {
                log.error("Error creating directories: {}", e.getMessage());
            }
        }
    }
}
