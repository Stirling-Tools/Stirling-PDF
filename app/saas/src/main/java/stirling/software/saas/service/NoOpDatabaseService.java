package stirling.software.saas.service;

import java.util.Collections;
import java.util.List;

import org.apache.commons.lang3.tuple.Pair;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

/** Saas-profile {@link DatabaseServiceInterface}: every method is a safe no-op. */
@Service
@Profile("saas")
@Slf4j
public class NoOpDatabaseService implements DatabaseServiceInterface {

    @Override
    public void exportDatabase() {
        log.debug("[saas] exportDatabase() skipped");
    }

    @Override
    public void importDatabase() {
        log.debug("[saas] importDatabase() skipped");
    }

    @Override
    public boolean hasBackup() {
        return false;
    }

    @Override
    public List<FileInfo> getBackupList() {
        return Collections.emptyList();
    }

    @Override
    public List<Pair<FileInfo, Boolean>> deleteAllBackups() {
        return Collections.emptyList();
    }

    @Override
    public List<Pair<FileInfo, Boolean>> deleteLastBackup() {
        return Collections.emptyList();
    }

    @Override
    public String getH2Version() {
        return "N/A (managed Postgres)";
    }
}
