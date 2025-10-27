package stirling.software.proprietary.security;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.filter.IPRateLimitingFilter;

@Component
@RequiredArgsConstructor
public class RateLimitResetScheduler {

    private final IPRateLimitingFilter rateLimitingFilter;

    @Scheduled(cron = "${security.rate-limit.reset-schedule:0 0 0 * * MON}")
    public void resetRateLimit() {
        rateLimitingFilter.resetRequestCounts();
    }
}
