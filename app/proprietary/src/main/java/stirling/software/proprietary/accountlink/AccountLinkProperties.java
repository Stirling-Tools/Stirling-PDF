package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.Getter;
import lombok.Setter;

/** Self-hosted side of combined billing: this instance bills through a linked SaaS team. */
@Getter
@Setter
@ApplicationScoped
public class AccountLinkProperties {

    private static final String PREFIX = "stirling.billing.account-link.";

    /** Master switch. When {@code false} (default) the feature is fully inert. */
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
     * Quarkus has no {@code @ConfigurationProperties} binder, so the prefixed keys are read from
     * MicroProfile config here; an unset key keeps the Java default above.
     */
    @PostConstruct
    void bindFromConfig() {
        Config config = ConfigProvider.getConfig();
        read(config, "enabled", Boolean.class).ifPresent(this::setEnabled);
        read(config, "saasBaseUrl", String.class).ifPresent(this::setSaasBaseUrl);
        read(config, "entitlementCacheSeconds", Long.class)
                .ifPresent(this::setEntitlementCacheSeconds);
        read(config, "requestTimeoutSeconds", Integer.class)
                .ifPresent(this::setRequestTimeoutSeconds);
        read(config, "metering.enabled", Boolean.class).ifPresent(metering::setEnabled);
        read(config, "metering.syncIntervalHours", Integer.class)
                .ifPresent(metering::setSyncIntervalHours);
        read(config, "metering.graceDays", Integer.class).ifPresent(metering::setGraceDays);
        read(config, "metering.workflowWindow", Duration.class)
                .ifPresent(metering::setWorkflowWindow);
    }

    /** Spring's relaxed binding accepted either spelling of a key, so both are tried. */
    private static <T> Optional<T> read(Config config, String name, Class<T> type) {
        Optional<T> value = config.getOptionalValue(PREFIX + toKebabCase(name), type);
        return value.isPresent() ? value : config.getOptionalValue(PREFIX + name, type);
    }

    private static String toKebabCase(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT);
    }

    /**
     * Dedicated billing switch, <b>separate</b> from {@link #enabled} so the link plumbing can be
     * enabled (e.g. to test linking) without ever turning on real usage metering, reporting, or cap
     * enforcement. Both default off; metering requires the master flag too. This is the production
     * safety key — flipping it on is what actually bills linked instances.
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
