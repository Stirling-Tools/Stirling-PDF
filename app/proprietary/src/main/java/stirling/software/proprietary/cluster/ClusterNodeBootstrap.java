package stirling.software.proprietary.cluster;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

/**
 * Registers the local node with {@link InstanceRegistry} on startup, refreshes the entry at 1/3 of
 * the TTL, and deregisters cleanly on shutdown.
 *
 * <p>Originally implemented Spring's {@code SmartLifecycle} with {@code getPhase() ==
 * Integer.MAX_VALUE} so Spring tore this bean down before {@code LettuceConnectionFactory} -
 * deregister therefore ran while the Valkey connection was still alive.
 *
 * <p>TODO: Migration required - Quarkus has no SmartLifecycle/getPhase shutdown-ordering
 * equivalent. Startup now runs via @Observes StartupEvent and shutdown via @PreDestroy. If the
 * Quarkus Redis/Valkey client is torn down before this bean's @PreDestroy, the deregister call may
 * fail (it already tolerates that via TTL expiry). If strict ordering is required, observe
 * io.quarkus.runtime.ShutdownEvent on a bean ordered ahead of the Redis client, or rely on the
 * heartbeat TTL to clean up the stale entry.
 */
@ApplicationScoped
@Slf4j
public class ClusterNodeBootstrap {

    // TODO: Migration required - Spring @ConditionalOnProperty(name = "cluster.enabled",
    // havingValue = "true") was a runtime toggle. Quarkus build-time conditionals
    // (@IfBuildProfile / @LookupIfProperty) cannot gate a StartupEvent observer at runtime, so the
    // bean is always instantiated and the toggle is enforced at runtime via clusterEnabled below.
    @ConfigProperty(name = "cluster.enabled", defaultValue = "false")
    boolean clusterEnabled;

    private Duration heartbeatTtl;

    private final ApplicationProperties applicationProperties;
    private final InstanceRegistry instanceRegistry;

    @ConfigProperty(name = "server.port", defaultValue = "8080")
    int serverPort;

    private volatile String nodeId;
    private volatile String internalAddress;
    private volatile boolean running = false;

    @Inject
    public ClusterNodeBootstrap(
            ApplicationProperties applicationProperties, InstanceRegistry instanceRegistry) {
        this.applicationProperties = applicationProperties;
        this.instanceRegistry = instanceRegistry;
    }

    @PostConstruct
    void init() {
        Cluster cluster = applicationProperties.getCluster();
        // Default must match the @Scheduled fallback below AND the model default
        // (ApplicationProperties.Cluster.Node.heartbeatIntervalMs = 5000); otherwise the TTL is
        // computed from a different interval than the scheduler runs at and the 3x margin breaks.
        long heartbeatMs =
                cluster.getNode() == null ? 5000L : cluster.getNode().getHeartbeatIntervalMs();
        // TTL = 3x heartbeat: tolerate two missed ticks before the node drops out of the registry.
        this.heartbeatTtl = Duration.ofMillis(heartbeatMs * 3);
    }

    void registerOnStartup(@Observes StartupEvent event) {
        if (!clusterEnabled) {
            return;
        }
        nodeId = applicationProperties.getCluster().resolvedNodeId();
        internalAddress = resolveInternalAddress();
        running = true;
        registerSelf("register");
    }

    // TODO: Migration required - Spring @Scheduled(fixedDelayString =
    // "${cluster.node.heartbeat-interval-ms:5000}") drove the interval directly from config in
    // milliseconds. Quarkus @Scheduled "every" expects a Duration string, so the config reference
    // "{cluster.node.heartbeat-interval-ms}" cannot be reused as-is (it resolves to a bare number).
    // Hard-coded to 5s to match the model default; if the interval is operator-tunable, expose a
    // duration-formatted property (e.g. cluster.node.heartbeat-interval=5s) and reference it here.
    @Scheduled(every = "5s")
    public void heartbeat() {
        if (!clusterEnabled) {
            return;
        }
        // Heartbeat-after-stop race: shutdown deregisters, but the @Scheduled tick keeps firing
        // during a slow drain. Without this guard, the next tick re-registers the dead node and
        // the entry resurfaces in the registry until TTL expiry.
        if (!running) {
            return;
        }
        if (nodeId == null) {
            return; // not yet registered (startup race)
        }
        // Self-healing: register() is idempotent and re-populates every field, so a wiped
        // Valkey (FLUSHALL, hash eviction) recovers on the next tick without operator action.
        registerSelf("heartbeat");
    }

    private void registerSelf(String reason) {
        try {
            instanceRegistry.register(
                    new ClusterNode(nodeId, internalAddress, Instant.now(), role()), heartbeatTtl);
            if ("register".equals(reason)) {
                log.info(
                        "Cluster node registered: nodeId={}, internalAddress={}, role={}, ttl={}s",
                        nodeId,
                        internalAddress,
                        role(),
                        heartbeatTtl.toSeconds());
            }
        } catch (RuntimeException e) {
            log.debug("Cluster {} failed for {}", reason, nodeId, e);
        }
    }

    @PreDestroy
    void stop() {
        running = false;
        if (nodeId == null) {
            return;
        }
        try {
            instanceRegistry.deregister(nodeId);
            log.info("Cluster node deregistered: {}", nodeId);
        } catch (RuntimeException e) {
            // Registry entry will TTL-expire within heartbeatTtl anyway.
            log.warn(
                    "Cluster deregister failed for {} (will TTL-expire within {}s): {}",
                    nodeId,
                    heartbeatTtl.toSeconds(),
                    e.getMessage());
        }
    }

    public boolean isRunning() {
        return running;
    }

    /**
     * Resolve the address peers should hit. Order: explicit config -> {@code POD_IP} env (K8s
     * downward API) -> JDK hostname -> fail loud (never silently fall back to a loopback).
     *
     * <p>Scheme is taken from {@code cluster.node.scheme} (default {@code http}). Set to {@code
     * https} when nodes terminate TLS themselves; leave as {@code http} when an upstream LB
     * terminates TLS and intra-cluster traffic is plain HTTP.
     */
    private String resolveInternalAddress() {
        Cluster cluster = applicationProperties.getCluster();
        String configured =
                cluster.getNode() == null ? null : cluster.getNode().getInternalAddress();
        if (configured != null && !configured.isBlank()) {
            return ensurePort(configured);
        }
        String podIp = System.getenv("POD_IP");
        if (podIp != null && !podIp.isBlank()) {
            return scheme() + "://" + podIp + ":" + serverPort;
        }
        try {
            return scheme()
                    + "://"
                    + InetAddress.getLocalHost().getHostAddress()
                    + ":"
                    + serverPort;
        } catch (UnknownHostException e) {
            throw new IllegalStateException(
                    "Could not resolve this host's address for cluster registration; set"
                            + " cluster.node.internal-address explicitly (or set POD_IP"
                            + " in the Kubernetes downward API).",
                    e);
        }
    }

    private String ensurePort(String addr) {
        if (addr.startsWith("http://") || addr.startsWith("https://")) {
            return addr;
        }
        if (addr.contains(":")) {
            return scheme() + "://" + addr;
        }
        return scheme() + "://" + addr + ":" + serverPort;
    }

    private String scheme() {
        Cluster cluster = applicationProperties.getCluster();
        if (cluster.getNode() == null
                || cluster.getNode().getScheme() == null
                || cluster.getNode().getScheme().isBlank()) {
            return "http";
        }
        String s = cluster.getNode().getScheme().trim().toLowerCase(Locale.ROOT);
        return "https".equals(s) ? "https" : "http";
    }

    private String role() {
        Cluster.NodeRole r = applicationProperties.getCluster().resolvedRole();
        return r == null ? "BOTH" : r.name();
    }
}
