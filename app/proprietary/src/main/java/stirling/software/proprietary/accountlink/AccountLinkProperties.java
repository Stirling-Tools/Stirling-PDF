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
}
