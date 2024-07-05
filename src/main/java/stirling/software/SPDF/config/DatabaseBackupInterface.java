package stirling.software.SPDF.config;

import java.io.IOException;
import java.util.List;

import stirling.software.SPDF.utils.FileInfo;

public interface DatabaseBackupInterface {
    void exportDatabase() throws IOException;

    boolean importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();
}
