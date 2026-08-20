package stirling.software.proprietary.security;

import io.quarkus.arc.profile.UnlessBuildProfile;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.filter.IPRateLimitingFilter;

@ApplicationScoped
@UnlessBuildProfile("saas")
@RequiredArgsConstructor
public class RateLimitResetScheduler {

    private final IPRateLimitingFilter rateLimitingFilter;

    // Quarkus @Scheduled cron supports the "{property:default}" placeholder syntax (no '$').
    // Quartz cron requires '?' for day-of-month when a day-of-week is given (it rejects '*' in both
    // fields); Spring's parser tolerated '*' here. Weekly on Monday at midnight.
    @Scheduled(cron = "{security.rate-limit.reset-schedule:0 0 0 ? * MON}")
    public void resetRateLimit() {
        rateLimitingFilter.resetRequestCounts();
    }
}
