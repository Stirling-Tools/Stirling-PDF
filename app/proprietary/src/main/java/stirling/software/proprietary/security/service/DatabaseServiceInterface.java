package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.List;

import org.apache.commons.lang3.tuple.Pair;

import stirling.software.common.model.FileInfo;
import stirling.software.common.model.exception.UnsupportedProviderException;

public interface DatabaseServiceInterface {
    void exportDatabase() throws SQLException, UnsupportedProviderException;

    void importDatabase();

    boolean hasBackup();

    List<FileInfo> getBackupList();

    List<Pair<FileInfo, Boolean>> deleteAllBackups();

    List<Pair<FileInfo, Boolean>> deleteLastBackup();

    /**
     * Upgrades the database schema from version 0.33.1 to 0.34.0
     *
     * @since 1.4.0
     */
    void upgradeFrom_0_33_1_to_0_34_0() throws Exception;

    /**
     * Upgrades the database schema from version 0.34.0 to 1.4.0
     *
     * @since 1.4.0
     */
    void upgradeFrom_0_34_0_to_1_4_0() throws Exception;
}
