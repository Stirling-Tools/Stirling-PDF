package stirling.software.SPDF.config.interfaces;

import java.sql.SQLException;
import java.util.List;

import stirling.software.SPDF.utils.FileInfo;
import stirling.software.common.model.exception.UnsupportedProviderException;

public interface DatabaseInterface {
    void exportDatabase() throws SQLException, UnsupportedProviderException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();
}
