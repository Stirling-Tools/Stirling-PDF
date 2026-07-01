package stirling.software.proprietary.accountlink;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Self-hosted side of combined-billing "Mode A" (connected self-hosted).
 *
 * <p>Binds the {@code stirling.billing.account-link.*} keys. {@link #enabled} mirrors the same flag
 * the gated beans test with {@code @ConditionalOnProperty}; it is kept here only so non-conditional
 * code (e.g. the gate's flag-off short-circuit, exposed status) can read it. The whole feature is
 * <b>off by default</b> and <b>dark</b> — when off nothing gates and the link endpoints 404.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stirling.billing.account-link")
public class AccountLinkProperties {

    /** Master switch. When {@code false} (default) the feature is fully inert. */
    private boolean enabled = false;

    /**
     * Base URL of the SaaS backend this instance links to (register + entitlement live there).
     *
     * <p>STUB: defaults to the public cloud host; an operator overrides it for staging. There is no
     * existing SaaS-base-url property in the self-hosted profile, so this is introduced here.
     */
    private String saasBaseUrl = "https://stirling.com/app";

    /** Cached entitlement is reused for this long before a refresh is attempted. */
    private long entitlementCacheSeconds = 300;

    /** Connect/read timeout for the outbound SaaS calls. */
    private int requestTimeoutSeconds = 10;

    /** Phase 2 usage metering + daily sync. Keyed under {@code …account-link.metering.*}. */
    private final Metering metering = new Metering();

    /**
     * Dedicated billing switch, <b>separate</b> from {@link #enabled} so the link plumbing can be
     * enabled (e.g. to test linking) without ever turning on real usage metering, reporting, or cap
     * enforcement. Both default off; metering requires the master flag too. This is the production
     * safety key — flipping it on is what actually bills linked instances.
     */
    @Getter
    @Setter
    public static class Metering {

        /** Turns on usage metering, the daily sync, and cap enforcement. Default off. */
        private boolean enabled = false;

        /**
         * How often the instance syncs usage + refreshes entitlement (matches the licence sync).
         */
        private int syncIntervalHours = 24;

        /**
         * Block billable work after this many days with no successful sync (fail-open → closed).
         */
        private int graceDays = 3;
    }
}
