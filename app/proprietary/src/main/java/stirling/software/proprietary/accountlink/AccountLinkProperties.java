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

    /**
     * Base URL of the SaaS backend this instance links to (register + entitlement live there). The
     * API host, not the web app: stirling.com/app answers /api/v1 with the SPA's HTML.
     */
    private String saasBaseUrl = "https://api2.stirling.com";

    /** Cached entitlement is reused for this long before a refresh is attempted. */
    private long entitlementCacheSeconds = 300;

    /** Connect/read timeout for the outbound SaaS calls. */
    private int requestTimeoutSeconds = 10;

    /**
     * Units granted each month while unlinked. Matches the SaaS default policy, so linking raises
     * the allowance rather than introducing one. 0 means billable work needs a link.
     */
    private long freeTierUnits = 1000;

    /** Phase 2 usage metering + daily sync. */
    private final Metering metering = new Metering();

    /**
     * The <em>cloud</em> ledger only. Local free-tier accrual is deliberately not gated here, or
     * the grant could not be enforced.
     */
    @Getter
    @Setter
    public static class Metering {

        /**
         * Accrues a linked instance's billable usage for the sync to report to its team's wallet.
         * Off leaves linked usage unbilled. {@link UsageMeterService} also treats a missing
         * property as on, so keep the two defaults together.
         */
        private boolean enabled = true;

        /**
         * How often the instance syncs usage + refreshes entitlement (matches the licence sync).
         */
        private int syncIntervalHours = 24;

        /**
         * Suspend cloud-backed Team features and processing after this many days without confirmed
         * entitlement.
         */
        private int graceDays = 3;

        /** Dedup window for identical input sets. */
        private Duration workflowWindow = Duration.ofMinutes(5);
    }
}
