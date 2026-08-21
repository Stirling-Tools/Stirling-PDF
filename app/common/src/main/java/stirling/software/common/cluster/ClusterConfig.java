package stirling.software.common.cluster;

import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

/**
 * Validates that cluster mode is internally consistent.
 *
 * <p>Cluster settings are bound on the central {@link ApplicationProperties} under {@code
 * cluster.*}; this class reads {@link ApplicationProperties#getCluster()} and runs guards in {@link
 * PostConstruct}. When {@code cluster.enabled=false} (the default) all checks are skipped so a
 * single-instance install needs no new config.
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class ClusterConfig {

    private final ApplicationProperties applicationProperties;

    @PostConstruct
    void validate() {
        Cluster cluster = applicationProperties.getCluster();
        if (!cluster.isEnabled()) {
            return;
        }
        String backplane = cluster.getBackplane();
        if ("valkey".equalsIgnoreCase(backplane)) {
            String url = cluster.getValkey() == null ? null : cluster.getValkey().getUrl();
            if (url == null || url.isBlank()) {
                throw new IllegalStateException(
                        "cluster.enabled=true with backplane=valkey requires"
                                + " cluster.valkey.url to be set (e.g."
                                + " redis://valkey:6379).");
            }
        } else if ("inprocess".equalsIgnoreCase(backplane)) {
            // enabled+inprocess only coordinates the local JVM; cross-node lookups will 410.
            log.warn(
                    "cluster.enabled=true with backplane=inprocess - only the local"
                            + " JVM is coordinated. Cross-node lookups and the file proxy will fail."
                            + " Use backplane=valkey for real multi-node deployments.");
        } else {
            // Fail fast on typos like "valky" so Spring doesn't later report a cryptic
            // "no ClusterBackplane bean" - the operator-facing error names the bad value.
            throw new IllegalStateException(
                    "cluster.enabled=true with unknown backplane '"
                            + backplane
                            + "'. Valid values: inprocess | valkey.");
        }
        log.info(
                "Cluster mode enabled (backplane={}, nodeRole={}, nodeId={}).",
                backplane,
                cluster.resolvedRole(),
                cluster.resolvedNodeId());
    }
}
