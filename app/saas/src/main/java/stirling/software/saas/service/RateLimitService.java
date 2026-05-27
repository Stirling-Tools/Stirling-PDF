package stirling.software.saas.service;

import java.time.Duration;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;

/** Invitation rate limiting; uses the cluster {@link RateLimitStore} so limits are global across nodes. */
@Service
@Profile("saas")
@Slf4j
@RequiredArgsConstructor
public class RateLimitService {

    private static final int INVITATION_LIMIT_PER_HOUR = 50;
    private static final int INVITATION_LIMIT_PER_DAY = 150;

    private final RateLimitStore rateLimitStore;

    public boolean allowInvitation(Long teamId) {
        String key = "team:" + teamId;

        // Daily before hourly: fixed-window consumes can't roll back, so reversed order would
        // burn an hourly slot on a request that gets rejected by the daily quota.
        RateLimitDecision daily =
                rateLimitStore.tryConsume(
                        "invite:day:" + key, INVITATION_LIMIT_PER_DAY, Duration.ofDays(1));
        if (!daily.allowed()) {
            log.warn("Team {} exceeded daily invitation limit", teamId);
            return false;
        }

        RateLimitDecision hourly =
                rateLimitStore.tryConsume(
                        "invite:hour:" + key, INVITATION_LIMIT_PER_HOUR, Duration.ofHours(1));
        if (!hourly.allowed()) {
            log.warn("Team {} exceeded hourly invitation limit", teamId);
            return false;
        }

        log.debug("Team {} invitation allowed", teamId);
        return true;
    }

    /** Policy limit, not a live remaining count ({@link RateLimitStore} has no peek). */
    public int getInvitationLimitPerHour() {
        return INVITATION_LIMIT_PER_HOUR;
    }
}
