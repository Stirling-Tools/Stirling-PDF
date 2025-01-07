package stirling.software.SPDF.config.security.database;

import java.sql.SQLException;

import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import stirling.software.SPDF.config.interfaces.DatabaseInterface;
import stirling.software.SPDF.controller.api.H2SQLCondition;
import stirling.software.SPDF.model.provider.UnsupportedProviderException;

@Component
@Conditional(H2SQLCondition.class)
public class ScheduledTasks {

    private final DatabaseInterface databaseService;

    public ScheduledTasks(DatabaseInterface databaseService) {
        this.databaseService = databaseService;
    }

    @Scheduled(cron = "0 0 0 * * ?")
    public void performBackup() throws SQLException, UnsupportedProviderException {
        databaseService.exportDatabase();
    }
}
