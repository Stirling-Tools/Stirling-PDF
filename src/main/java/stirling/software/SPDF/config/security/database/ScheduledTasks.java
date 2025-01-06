package stirling.software.SPDF.config.security.database;

import java.io.IOException;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledTasks {

    private final DatabaseBackupHelper databaseBackupService;

    public ScheduledTasks(DatabaseBackupHelper databaseBackupService) {
        this.databaseBackupService = databaseBackupService;
    }

    @Scheduled(cron = "0 0 0 * * ?")
    public void performBackup() throws IOException {
        databaseBackupService.exportDatabase();
    }
}
