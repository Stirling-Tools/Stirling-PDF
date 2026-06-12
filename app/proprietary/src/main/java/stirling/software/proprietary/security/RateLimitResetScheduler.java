package stirling.software.proprietary.security;

import io.quarkus.arc.profile.UnlessBuildProfile;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.filter.IPRateLimitingFilter;

// TODO: Migration required - Spring @Profile("!saas") gated this scheduler so it never ran in the
// "saas" profile. @io.quarkus.arc.profile.UnlessBuildProfile("saas") reproduces this when "saas" is
// a Quarkus BUILD profile; if "saas" is only a runtime profile, this annotation has no effect and
// the body of resetRateLimit() must instead short-circuit on a runtime profile check
// (org.eclipse.microprofile.config Config "quarkus.profile" / ProfileManager.getActiveProfile()).
@ApplicationScoped
@UnlessBuildProfile("saas")
@RequiredArgsConstructor
public class RateLimitResetScheduler {

    private final IPRateLimitingFilter rateLimitingFilter;

    // Quarkus @Scheduled cron supports the "{property:default}" placeholder syntax (no '$').
    @Scheduled(cron = "{security.rate-limit.reset-schedule:0 0 0 * * MON}")
    public void resetRateLimit() {
        rateLimitingFilter.resetRequestCounts();
    }
}
