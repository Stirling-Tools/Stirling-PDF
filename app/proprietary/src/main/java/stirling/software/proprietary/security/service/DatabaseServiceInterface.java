package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.List;

import org.apache.commons.lang3.tuple.Pair;

import stirling.software.common.model.FileInfo;

public interface DatabaseServiceInterface {
    void exportDatabase() throws SQLException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();

    List<Pair<FileInfo, Boolean>> deleteAllBackups();

    List<Pair<FileInfo, Boolean>> deleteLastBackup();
}
