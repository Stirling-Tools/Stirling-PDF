package stirling.software.spdf.proprietary.security.persistence;

import java.sql.SQLException;

import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import stirling.software.spdf.proprietary.security.DatabaseInterface;
import stirling.software.spdf.proprietary.security.controller.api.H2SQLCondition;
import stirling.software.spdf.proprietary.security.model.exception.UnsupportedProviderException;

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
