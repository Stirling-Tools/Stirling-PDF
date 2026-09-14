package stirling.software.proprietary.accountlink;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Self-hosted side of combined billing: the instance's own free tier, plus the optional link.
 *
 * <p>Unconditional, so the grant size is readable before any gated bean exists.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stirling.billing.account-link")
public class AccountLinkProperties {

    /**
     * Kill switch for combined billing, free tier included. On by default: the free tier is the
     * instance's own allowance, not an opt-in. Off runs every billable op unmetered.
     */
    private boolean enabled = true;

    /** Base URL of the SaaS backend this instance links to (register + entitlement live there). */
    private String saasBaseUrl = "https://stirling.com/app";

    /** Cached entitlement is reused for this long before a refresh is attempted. */
    private long entitlementCacheSeconds = 300;

    /** Connect/read timeout for the outbound SaaS calls. */
    private int requestTimeoutSeconds = 10;

    /**
     * Units granted each month while unlinked. Matches the SaaS default policy, so linking raises
     * the allowance rather than introducing one. 0 means billable work needs a link.
     */
    private long freeTierUnits = 500;

    /** Phase 2 usage metering + daily sync. */
    private final Metering metering = new Metering();

    /**
     * The <em>cloud</em> ledger only. Local free-tier accrual is deliberately not gated here, or
     * the grant could not be enforced.
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
