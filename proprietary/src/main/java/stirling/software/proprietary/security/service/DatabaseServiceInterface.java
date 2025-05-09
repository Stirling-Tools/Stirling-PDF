<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/service/DatabaseServiceInterface.java
package stirling.software.proprietary.security.service;
========
package stirling.software.enterprise.security.service;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/service/DatabaseServiceInterface.java

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
