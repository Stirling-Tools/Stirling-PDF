package stirling.software.SPDF.config.anonymus.session;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class AnonymusSessionService {

    @Autowired private AnonymusSessionRegistry sessionRegistry;

    @Scheduled(cron = "0 0/1 * * * ?")
    public void expireSessions() {
        List<AnonymusSessionInfo> allNonExpiredSessions =
                new ArrayList<>(sessionRegistry.getAllNonExpiredSessions());
        if (allNonExpiredSessions.isEmpty()) {
            log.info("Keine nicht abgelaufenen Sessions gefunden.");
            return;
        } else {
            log.info("Es gibt {} nicht abgelaufene Sessions", allNonExpiredSessions.size());
        }
    }
}
