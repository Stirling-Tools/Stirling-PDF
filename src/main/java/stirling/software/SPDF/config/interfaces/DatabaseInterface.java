package stirling.software.SPDF.config.interfaces;

import java.io.IOException;
import java.util.List;

import stirling.software.SPDF.utils.FileInfo;

public interface DatabaseInterface {
    void exportDatabase() throws IOException;

    List<FileInfo> getBackupList();
}
