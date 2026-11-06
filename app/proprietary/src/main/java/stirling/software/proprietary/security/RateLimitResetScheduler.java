package stirling.software.proprietary.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import stirling.software.common.scheduling.LazyScheduledTask;
import stirling.software.proprietary.security.filter.IPRateLimitingFilter;

@Component
@Profile("!saas")
public class RateLimitResetScheduler {

    private final IPRateLimitingFilter rateLimitingFilter;
    private final LazyScheduledTask rateLimitReset;
    private final String resetSchedule;

    public RateLimitResetScheduler(
            IPRateLimitingFilter rateLimitingFilter,
            TaskScheduler scheduler,
            @Value("${security.rate-limit.reset-schedule:0 0 0 * * MON}") String resetSchedule) {
        this.rateLimitingFilter = rateLimitingFilter;
        this.resetSchedule = resetSchedule;
        this.rateLimitReset = new LazyScheduledTask(scheduler, this::resetRateLimit);
    }

    /** Registers the reset on the first request the IP filter processes. */
    public boolean ensureScheduled() {
        return rateLimitReset.ensureCron(resetSchedule);
    }

    public void resetRateLimit() {
        rateLimitingFilter.resetRequestCounts();
    }
}
