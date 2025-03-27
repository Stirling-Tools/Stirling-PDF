package stirling.software.SPDF.config.anonymus.session;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class AnonymusSessionService {

    @Autowired private AnonymusSessionRegistry sessionRegistry;

    @Value("${server.servlet.session.timeout:120s}") // TODO: Change to 30m
    private Duration defaultMaxInactiveInterval;

    @Scheduled(cron = "0 0/1 * * * ?")
    public void expireSessions() {
        Instant now = Instant.now();
        List<AnonymusSessionInfo> allNonExpiredSessions =
                sessionRegistry.getAllNonExpiredSessions().stream()
                        .map(s -> (AnonymusSessionInfo) s)
                        .collect(Collectors.toList());
        for (AnonymusSessionInfo sessionInformation : allNonExpiredSessions) {
            Date lastRequest = sessionInformation.getLastRequest();
            int maxInactiveInterval = (int) defaultMaxInactiveInterval.getSeconds();
            Instant expirationTime =
                    lastRequest.toInstant().plus(maxInactiveInterval, ChronoUnit.SECONDS);

            if (now.isAfter(expirationTime)) {
                log.info(
                        "SessionID: {} expiration time: {} Current time: {}",
                        sessionInformation.getSession().getId(),
                        expirationTime,
                        now);
                sessionInformation.setExpired(true);
            }
        }
    }
}
