package stirling.software.proprietary.security.database;

import java.sql.SQLException;

import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

@ApplicationScoped
@RequiredArgsConstructor
public class ScheduledTasks {

    private final DatabaseServiceInterface databaseService;

    @Inject H2SQLCondition h2SQLCondition;

    @Scheduled(cron = "{system.databaseBackup.cron:off}")
    public void performBackup() throws SQLException, UnsupportedProviderException {
        if (!h2SQLCondition.matches()) {
            return;
        }
        databaseService.exportDatabase();
    }
}
