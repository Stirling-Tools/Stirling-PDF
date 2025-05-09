<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/database/ScheduledTasks.java
package stirling.software.proprietary.security.database;
========
package stirling.software.enterprise.security.database;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/database/ScheduledTasks.java

import java.sql.SQLException;

import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/database/ScheduledTasks.java
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
========
import stirling.software.enterprise.security.service.DatabaseServiceInterface;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/database/ScheduledTasks.java

@Component
@Conditional(H2SQLCondition.class)
@RequiredArgsConstructor
public class ScheduledTasks {

    private final DatabaseServiceInterface databaseService;

    @Scheduled(cron = "0 0 0 * * ?")
    public void performBackup() throws SQLException, UnsupportedProviderException {
        databaseService.exportDatabase();
    }
}
