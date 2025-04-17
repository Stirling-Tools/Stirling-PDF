package stirling.software.spdf.proprietary.security;

import java.sql.SQLException;
import java.util.List;

import stirling.software.spdf.proprietary.security.model.FileInfo;
import stirling.software.spdf.proprietary.security.model.exception.UnsupportedProviderException;

public interface DatabaseInterface {
    void exportDatabase() throws SQLException, UnsupportedProviderException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();
}
