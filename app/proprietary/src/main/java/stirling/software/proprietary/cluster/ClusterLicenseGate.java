package stirling.software.proprietary.cluster;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

/**
 * Runtime license gate for cluster mode. Cluster mode requires a SERVER or ENTERPRISE license; the
 * SaaS flavor bypasses (no {@code runningProOrHigher} bean is published). Fires before any Valkey
 * bean construction via {@link Ordered#HIGHEST_PRECEDENCE}.
 *
 * <p>There is no testing/development bypass. Live e2e tests that need cluster mode must inject a
 * valid {@code stirling.premium.key} for a test-tier SERVER/ENTERPRISE license. Unit tests stub the
 * {@code runningProOrHigher} bean directly.
 */
@Configuration
@ConditionalOnProperty(name = "cluster.enabled", havingValue = "true")
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class ClusterLicenseGate {

    @Autowired(required = false)
    @Qualifier("runningProOrHigher")
    private Boolean runningProOrHigher;

    @PostConstruct
    void verifyLicense() {
        if (runningProOrHigher == null) {
            return; // saas flavor - licensed via Stripe elsewhere
        }
        if (!runningProOrHigher) {
            throw new IllegalStateException(
                    "Cluster mode (cluster.enabled=true) requires a SERVER or"
                            + " ENTERPRISE license. Configure stirling.premium.key with a valid"
                            + " license key (contact sales@stirlingpdf.com to obtain one), or set"
                            + " cluster.enabled=false.");
        }
        log.info("Cluster license gate: SERVER/ENTERPRISE license verified, cluster mode allowed.");
    }
}
