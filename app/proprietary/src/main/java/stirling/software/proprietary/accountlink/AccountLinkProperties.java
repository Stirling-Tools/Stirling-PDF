package stirling.software.proprietary.accountlink;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/** Self-hosted side of combined billing: this instance bills through a linked SaaS team. */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stirling.billing.account-link")
public class AccountLinkProperties {

    /** Master switch. */
    private boolean enabled = false;

    /** Base URL of the SaaS backend this instance links to (register + entitlement live there). */
    private String saasBaseUrl = "https://stirling.com/app";

    /** Cached entitlement is reused for this long before a refresh is attempted. */
    private long entitlementCacheSeconds = 300;

    /** Connect/read timeout for the outbound SaaS calls. */
    private int requestTimeoutSeconds = 10;

    /** Phase 2 usage metering + daily sync. */
    private final Metering metering = new Metering();

    /**
     * Separate from {@link #enabled} so linking can be exercised without billing anything. Both
     * default off, and metering needs the master flag as well.
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
