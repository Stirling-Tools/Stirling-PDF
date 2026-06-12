package stirling.software.proprietary.cluster;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import lombok.extern.slf4j.Slf4j;

/**
 * Runtime license gate for cluster mode. Cluster mode requires a SERVER or ENTERPRISE license; the
 * SaaS flavor bypasses (no {@code runningProOrHigher} bean is published). The Valkey connection
 * config {@code @DependsOn} this bean, so it runs before any Valkey bean is constructed.
 *
 * <p>TODO: Migration required - Spring @DependsOn ordering relative to the Valkey connection config
 * has no direct Quarkus equivalent. Ensure the Valkey/Redis bean either @Inject's this gate or that
 * this @PostConstruct verification still runs before any Valkey bean is constructed (e.g. via a
 * Startup observer ordering or an explicit dependency).
 */
@ApplicationScoped
@Slf4j
public class ClusterLicenseGate {

    // @ConditionalOnProperty(name = "cluster.enabled", havingValue = "true") -> runtime guard
    // below.
    @ConfigProperty(name = "cluster.enabled", defaultValue = "false")
    boolean clusterEnabled;

    // @Autowired(required = false) @Qualifier("runningProOrHigher") -> optional named lookup.
    @Inject
    @Named("runningProOrHigher")
    Instance<Boolean> runningProOrHigher;

    @PostConstruct
    void verifyLicense() {
        if (!clusterEnabled) {
            return; // cluster mode disabled - gate not applicable
        }
        if (!runningProOrHigher.isResolvable()) {
            return; // saas flavor - licensed via Stripe elsewhere
        }
        if (!runningProOrHigher.get()) {
            throw new IllegalStateException(
                    "Cluster mode (cluster.enabled=true) requires a SERVER or"
                            + " ENTERPRISE license. Configure stirling.premium.key with a valid"
                            + " license key (contact sales@stirlingpdf.com to obtain one), or set"
                            + " cluster.enabled=false.");
        }
        log.info("Cluster license gate: SERVER/ENTERPRISE license verified, cluster mode allowed.");
    }
}
