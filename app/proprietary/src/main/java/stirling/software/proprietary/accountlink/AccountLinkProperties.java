package stirling.software.proprietary.accountlink;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Self-hosted side of combined billing: the instance's own free tier, plus the optional link to a
 * SaaS team that buys more.
 *
 * <p>A plain {@code @Component} with no condition of its own, so the settings stay readable even
 * with {@link #enabled} off — which is what lets the free-tier grant size be read before any of the
 * gated beans exist.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stirling.billing.account-link")
public class AccountLinkProperties {

    /**
     * Kill switch for combined billing as a whole, free tier included. On by default because the
     * free tier is the instance's own allowance and is not something an operator opts into; off
     * returns the instance to running every billable operation unmetered and unlimited.
     */
    private boolean enabled = true;

    /** Base URL of the SaaS backend this instance links to (register + entitlement live there). */
    private String saasBaseUrl = "https://stirling.com/app";

    /** Cached entitlement is reused for this long before a refresh is attempted. */
    private long entitlementCacheSeconds = 300;

    /** Connect/read timeout for the outbound SaaS calls. */
    private int requestTimeoutSeconds = 10;

    /**
     * Units the instance grants itself each month while unlinked. Matches the grant SaaS seeds on
     * its default pricing policy, so linking raises the allowance rather than introducing one; 0
     * means no free tier, and billable work then needs a link.
     */
    private long freeTierUnits = 500;

    /** Phase 2 usage metering + daily sync. */
    private final Metering metering = new Metering();

    /**
     * Governs the <em>cloud</em> ledger only: costing a linked team's usage and pushing it to SaaS.
     * Separate from {@link #enabled} so linking can be exercised without billing anything. Local
     * free-tier accrual is not gated here, or the grant could not be enforced.
     */
    @Getter
    @Setter
    public static class Metering {

        /** Turns on usage metering, the daily sync, and cap enforcement. */
        private boolean enabled = false;

        /**
         * How often the instance syncs usage + refreshes entitlement (matches the licence sync).
         */
        private int syncIntervalHours = 24;

        /**
         * Block billable work after this many days with no successful sync (fail-open → closed).
         */
        private int graceDays = 3;

        /** Dedup window for identical input sets. */
        private Duration workflowWindow = Duration.ofMinutes(5);
    }
}
