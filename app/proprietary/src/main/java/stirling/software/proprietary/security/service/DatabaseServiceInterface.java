package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

import org.apache.commons.lang3.tuple.Pair;

import stirling.software.common.model.FileInfo;
import stirling.software.common.model.exception.UnsupportedProviderException;

public interface DatabaseServiceInterface {
    org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(DatabaseServiceInterface.class);

    void exportDatabase() throws SQLException, UnsupportedProviderException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();

    List<Pair<FileInfo, Boolean>> deleteAllBackups();

    List<Pair<FileInfo, Boolean>> deleteLastBackup();

    void migrateDatabase();

    boolean deleteBackupFile(String fileName) throws IOException;

    Path getBackupFilePath(String fileName);

    boolean importDatabaseFromUI(String fileName);

    boolean importDatabaseFromUI(Path tempTemplatePath) throws IOException;

    default String selectCoalesceMax(String tableName, String columnName) {
        StringBuilder sb = new StringBuilder();
        sb.append("SELECT COALESCE(MAX(\"");
        sb.append(columnName);
        sb.append("\"),0)+1 FROM PUBLIC.");
        sb.append(tableName);
        return sb.toString();
    }

    default String createLinkedTable(String memUrlEsc, String tableName) {
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

    default String dropLinkedTable(String tableName) {
        return "DROP TABLE IF EXISTS OLD_" + tableName;
    }

    default String alterTableAddColumn(String tableName, String columnName, long columnDefinition) {
        StringBuilder alterTable = new StringBuilder();
        alterTable.append("ALTER TABLE PUBLIC.");
        alterTable.append(tableName);
        alterTable.append(" ALTER COLUMN ");
        alterTable.append(columnName);
        alterTable.append(" RESTART WITH ");
        alterTable.append(columnDefinition);
        return alterTable.toString();
    }

    default void restartIdentityIfApplicable(
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
                    LOG.debug(
                            "Column {}.{} is not IDENTITY; skip RESTART WITH {}",
                            tableName,
                            columnName,
                            restartWith);
                }
            }
        }
    }
}
