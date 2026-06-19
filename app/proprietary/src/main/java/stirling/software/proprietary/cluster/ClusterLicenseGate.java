package stirling.software.proprietary.cluster;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
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
 * this verification still runs before any Valkey bean is constructed (e.g. via a Startup observer
 * ordering or an explicit dependency).
 */
@ApplicationScoped
@Slf4j
public class ClusterLicenseGate {

    // @ConditionalOnProperty(name = "cluster.enabled", havingValue = "true") -> runtime guard
    // in onStart below.
    @ConfigProperty(name = "cluster.enabled", defaultValue = "false")
    boolean clusterEnabled;

    // @Autowired(required = false) @Qualifier("runningProOrHigher") -> optional named lookup.
    @Inject
    @Named("runningProOrHigher")
    Instance<Boolean> runningProOrHigherInstance;

    // Optional license flag resolved from the injected Instance at startup: TRUE/FALSE when the
    // bean is present, null in the saas flavor (no runningProOrHigher bean published).
    private Boolean runningProOrHigher;

    // Runs eagerly at startup so the gate actually fires; a lazy @ApplicationScoped @PostConstruct
    // would never run because nothing injects this bean. Only verifies when cluster mode is on.
    void onStart(@Observes StartupEvent event) {
        if (!clusterEnabled) {
            return; // cluster mode disabled - gate not applicable
        }
        runningProOrHigher =
                runningProOrHigherInstance.isResolvable() ? runningProOrHigherInstance.get() : null;
        verifyLicense();
    }

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
