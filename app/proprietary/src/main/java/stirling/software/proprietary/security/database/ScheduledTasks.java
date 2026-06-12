package stirling.software.proprietary.security.database;

import java.sql.SQLException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import io.quarkus.scheduler.Scheduled;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

@ApplicationScoped
@RequiredArgsConstructor
public class ScheduledTasks {

    private final DatabaseServiceInterface databaseService;

    @Inject H2SQLCondition h2SQLCondition;

    // TODO: Migration required - the original bean used @Conditional(H2SQLCondition.class) to skip
    // registration entirely when not running on H2. Quarkus has no runtime @Conditional, so the gate
    // is evaluated at runtime here via h2SQLCondition.matches() and the backup is short-circuited
    // when false. The schedule still fires on the configured cron but becomes a no-op off H2.
    //
    // TODO: Migration required - the Spring cron was a SpEL expression
    // "#{applicationProperties.system.databaseBackup.cron}". Quarkus @Scheduled resolves config
    // expressions of the form "{config.key}", so this assumes the value is exposed under the config
    // key "system.databaseBackup.cron" (default disabled). Verify the ApplicationProperties binding
    // exposes that key (or adjust the key) once ApplicationProperties is rebound via @ConfigMapping.
    @Scheduled(cron = "{system.databaseBackup.cron:off}")
    public void performBackup() throws SQLException, UnsupportedProviderException {
        if (!h2SQLCondition.matches()) {
            return;
        }
        databaseService.exportDatabase();
    }
}
