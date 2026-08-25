package stirling.software.common.cluster;

import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

/** Validates cluster config consistency. All guards are skipped when cluster.enabled=false. */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class ClusterConfig {

    private static final String MISSING_URL_MESSAGE =
            "cluster.enabled=true with backplane=valkey requires"
                    + " cluster.valkey.url to be set (e.g."
                    + " redis://valkey:6379).";

    private final ApplicationProperties applicationProperties;

    @PostConstruct
    void validate() {
        Cluster cluster = applicationProperties.getCluster();
        if (!cluster.isEnabled()) {
            return;
        }
        String backplane = cluster.getBackplane();
        if ("valkey".equalsIgnoreCase(backplane)) {
            // getValkey() re-seeds a null block, so an absent 'valkey:' reads as a missing url.
            ApplicationProperties.Cluster.Valkey valkey = cluster.getValkey();
            // resolvedMode() throws on an unknown/ambiguous mode; let it propagate so the
            // operator sees the property name rather than a later missing-bean error.
            ApplicationProperties.Cluster.Valkey.ValkeyMode mode = valkey.resolvedMode();
            validateModeConsistency(valkey, mode);
            switch (mode) {
                case STANDALONE -> validateStandalone(valkey);
                case SENTINEL -> validateSentinel(valkey);
                case CLUSTER -> validateCluster(valkey);
            }
            validateCommon(valkey, mode);
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
                "Cluster mode enabled (backplane={}, valkeyMode={}, nodeRole={}, nodeId={}).",
                backplane,
                "valkey".equalsIgnoreCase(backplane) ? cluster.getValkey().resolvedMode() : "n/a",
                cluster.resolvedRole(),
                cluster.resolvedNodeId());
    }

    private static void validateStandalone(ApplicationProperties.Cluster.Valkey valkey) {
        String url = valkey.getUrl();
        if (url == null || url.isBlank()) {
            throw new IllegalStateException(MISSING_URL_MESSAGE);
        }
    }

    /**
     * Endpoint lists are only read by their own mode. Without this an operator who sets the nodes
     * but forgets the mode selector silently connects to whatever {@code cluster.valkey.url} holds.
     */
    private static void validateModeConsistency(
            ApplicationProperties.Cluster.Valkey valkey,
            ApplicationProperties.Cluster.Valkey.ValkeyMode mode) {
        var sentinel = valkey.getSentinel();
        boolean sentinelNodesSet = !sentinel.getNodes().isEmpty();
        if (sentinelNodesSet && mode != ApplicationProperties.Cluster.Valkey.ValkeyMode.SENTINEL) {
            throw new IllegalStateException(
                    "cluster.valkey.sentinel.nodes is set but the resolved mode is "
                            + mode
                            + ", so the sentinel list is ignored and the client would connect to"
                            + " cluster.valkey.url instead. Set cluster.valkey.sentinel.master (the"
                            + " monitored primary name, e.g. mymaster) or"
                            + " cluster.valkey.mode=sentinel.");
        }
        if (!valkey.getNodes().isEmpty()
                && mode != ApplicationProperties.Cluster.Valkey.ValkeyMode.CLUSTER) {
            throw new IllegalStateException(
                    "cluster.valkey.nodes is set but the resolved mode is "
                            + mode
                            + ", so the seed node list is ignored. Set"
                            + " cluster.valkey.mode=cluster, or remove cluster.valkey.nodes if this"
                            + " deployment is not a Valkey Cluster.");
        }
    }

    private static void validateSentinel(ApplicationProperties.Cluster.Valkey valkey) {
        var sentinel = valkey.getSentinel();
        if (sentinel.getMaster() == null || sentinel.getMaster().isBlank()) {
            throw new IllegalStateException(
                    "cluster.valkey.mode=sentinel requires cluster.valkey.sentinel.master to be"
                            + " set (the monitored primary name, e.g. mymaster).");
        }
        if (sentinel.getNodes().isEmpty()) {
            throw new IllegalStateException(
                    "cluster.valkey.mode=sentinel requires cluster.valkey.sentinel.nodes to list"
                            + " at least one sentinel (e.g."
                            + " sentinel-1:26379,sentinel-2:26379,sentinel-3:26379).");
        }
        for (String entry : sentinel.getNodes()) {
            HostPort.parse(entry, "cluster.valkey.sentinel.nodes", "sentinel-1:26379");
        }
        // Sentinel AUTH is separate from data-node AUTH; only warn, some sentinels are open.
        if ((sentinel.getPassword() == null || sentinel.getPassword().isBlank())
                && valkey.getPassword() != null
                && !valkey.getPassword().isBlank()) {
            log.warn(
                    "cluster.valkey.password is set but cluster.valkey.sentinel.password is not."
                            + " Sentinel connections authenticate separately; if your sentinels"
                            + " require AUTH, set cluster.valkey.sentinel.password too.");
        }
    }

    private static void validateCluster(ApplicationProperties.Cluster.Valkey valkey) {
        if (valkey.getNodes().isEmpty()) {
            throw new IllegalStateException(
                    "cluster.valkey.mode=cluster requires cluster.valkey.nodes to list at least"
                            + " one seed node (e.g. valkey-1:6379,valkey-2:6379,valkey-3:6379).");
        }
        for (String entry : valkey.getNodes()) {
            HostPort.parse(entry, "cluster.valkey.nodes", "valkey-1:6379");
        }
        if (valkey.getMaxRedirects() < 1) {
            throw new IllegalStateException(
                    "cluster.valkey.maxRedirects must be >= 1 in cluster mode; got "
                            + valkey.getMaxRedirects()
                            + ".");
        }
        // Lettuce rejects a non-positive refresh period with an opaque assertion at boot.
        if (valkey.getTopologyRefreshMs() <= 0) {
            throw new IllegalStateException(
                    "cluster.valkey.topologyRefreshMs must be > 0 in cluster mode; got "
                            + valkey.getTopologyRefreshMs()
                            + ".");
        }
    }

    private static void validateCommon(
            ApplicationProperties.Cluster.Valkey valkey,
            ApplicationProperties.Cluster.Valkey.ValkeyMode mode) {
        var pool = valkey.getPool();
        if (pool.isEnabled() && pool.getMaxActive() < 2) {
            throw new IllegalStateException(
                    "cluster.valkey.pool.maxActive must be >= 2 when pooling is enabled (one"
                            + " connection is permanently held by the shared native connection);"
                            + " got "
                            + pool.getMaxActive()
                            + ".");
        }
        if (pool.isEnabled() && pool.getMaxWaitMillis() <= 0) {
            throw new IllegalStateException(
                    "cluster.valkey.pool.maxWaitMillis must be > 0 (a negative value blocks"
                            + " forever, which defeats cluster.valkey.commandTimeoutMs, and 0"
                            + " fails the borrow instantly once the pool is exhausted); got "
                            + pool.getMaxWaitMillis()
                            + ".");
        }
        if (valkey.getCommandTimeoutMs() <= 0) {
            throw new IllegalStateException(
                    "cluster.valkey.commandTimeoutMs must be > 0; got "
                            + valkey.getCommandTimeoutMs()
                            + ".");
        }
        if (mode != ApplicationProperties.Cluster.Valkey.ValkeyMode.STANDALONE
                && valkey.getUrl() != null
                && !valkey.getUrl().isBlank()) {
            log.info(
                    "cluster.valkey.url is ignored in mode={} (endpoints come from {}).",
                    mode,
                    mode == ApplicationProperties.Cluster.Valkey.ValkeyMode.SENTINEL
                            ? "cluster.valkey.sentinel.nodes"
                            : "cluster.valkey.nodes");
        }
    }
}
