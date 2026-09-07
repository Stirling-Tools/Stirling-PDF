package stirling.software.saas.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Removes connect requests that are past use.
 *
 * <p>Needed rather than merely tidy: anyone can create a row on {@code POST /connect/request}, and
 * nothing else deletes one. Requests hold a callback URL and the requester's address, so they are
 * swept soon after expiry rather than kept.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
@RequiredArgsConstructor
public class ConnectRequestCleanupService {

    /** Long enough to answer "what happened to my link?" the next morning, and no longer. */
    private static final int RETAIN_HOURS = 24;

    private final ConnectRequestRepository repo;

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpired() {
        try {
            LocalDateTime cutoff = LocalDateTime.now().minusHours(RETAIN_HOURS);
            int deleted = repo.deleteByExpiresAtBefore(cutoff);
            if (deleted > 0) {
                log.info("Account-link connect: purged {} expired requests", deleted);
            }
        } catch (Exception e) {
            // A failed sweep must not take the scheduler down; the next run retries.
            log.error("Account-link connect: purge failed", e);
        }
    }
}
