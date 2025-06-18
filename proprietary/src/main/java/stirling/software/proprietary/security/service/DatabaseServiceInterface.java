package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.List;

import stirling.software.common.model.FileInfo;
import stirling.software.common.model.exception.UnsupportedProviderException;

public interface DatabaseServiceInterface {
    void exportDatabase() throws SQLException, UnsupportedProviderException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();
}
