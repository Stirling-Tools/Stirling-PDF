package stirling.software.SPDF.config.security.database;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledTasks {

    @Autowired private DatabaseBackupHelper databaseBackupService;

    @Scheduled(cron = "0 0 0 * * ?")
    public void performBackup() throws IOException {
        databaseBackupService.exportDatabase();
    }
}
