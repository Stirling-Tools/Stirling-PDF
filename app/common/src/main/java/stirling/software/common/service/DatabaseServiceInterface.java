package stirling.software.common.service;

import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;

import org.apache.commons.lang3.tuple.Pair;

import stirling.software.common.model.FileInfo;

/**
 * Service interface for database backup and restore operations. Implementations handle exporting
 * and importing database contents.
 */
public interface DatabaseServiceInterface {

    /**
     * Checks if any backup files exist.
     *
     * @return true if backups exist, false otherwise
     */
    boolean hasBackup();

    /**
     * Gets a list of all available backup files.
     *
     * @return list of backup file information
     */
    List<FileInfo> getBackupList();

    /**
     * Imports the latest database backup.
     *
     * @throws SQLException if import fails
     */
    void importDatabase() throws SQLException;

    /**
     * Imports a specific database backup by filename.
     *
     * @param fileName the backup file name
     * @return true if successful, false otherwise
     * @throws SQLException if import fails
     */
    boolean importDatabaseFromUI(String fileName) throws SQLException;

    /**
     * Imports a database backup from a specific path.
     *
     * @param tempTemplatePath the path to the backup file
     * @return true if successful, false otherwise
     * @throws SQLException if import fails
     */
    boolean importDatabaseFromUI(Path tempTemplatePath) throws SQLException;

    /**
     * Exports the current database to a backup file.
     *
     * @throws SQLException if export fails
     */
    void exportDatabase() throws SQLException;

    /**
     * Deletes all backup files.
     *
     * @return list of pairs containing file info and deletion success status
     */
    List<Pair<FileInfo, Boolean>> deleteAllBackups();

    /**
     * Deletes the most recent backup file.
     *
     * @return list of pairs containing file info and deletion success status
     */
    List<Pair<FileInfo, Boolean>> deleteLastBackup();

    /**
     * Gets the database version.
     *
     * @return the database version string
     */
    String getH2Version();

    /**
     * Deletes a specific backup file.
     *
     * @param fileName the backup file name
     * @return true if successful, false otherwise
     */
    boolean deleteBackupFile(String fileName);

    /**
     * Gets the full path to a backup file.
     *
     * @param fileName the backup file name
     * @return the path to the backup file
     */
    Path getBackupFilePath(String fileName);
}
