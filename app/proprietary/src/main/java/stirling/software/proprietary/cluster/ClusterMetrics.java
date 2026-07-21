package stirling.software.proprietary.cluster;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import stirling.software.common.cluster.StickyMissRecorder;
import stirling.software.common.model.ApplicationProperties;

/**
 * Cluster operation metrics exposed via {@code /actuator/prometheus}. Registered only when cluster
 * mode is on.
 */
@Component
@ConditionalOnProperty(name = "cluster.enabled", havingValue = "true")
public class ClusterMetrics implements StickyMissRecorder {

    private final MeterRegistry registry;
    private final ApplicationProperties applicationProperties;

    private final Counter stickyMissTotal;
    private final Counter rateLimitRejected;
    private final Timer backplaneLatency;
    private final Timer jobWaitSeconds;

    // Per-lane queue depth gauges. Lanes are a fixed enum (FAST, SLOW, AI), so we register all
    // three eagerly so dashboards never have a missing series.
    private static final List<String> KNOWN_LANES = List.of("FAST", "SLOW", "AI");
    private final ConcurrentHashMap<String, AtomicLong> queueDepth = new ConcurrentHashMap<>();

    private final AtomicLong jobsInflight = new AtomicLong();

    public ClusterMetrics(MeterRegistry registry, ApplicationProperties applicationProperties) {
        this.registry = registry;
        this.applicationProperties = applicationProperties;
        this.stickyMissTotal =
                Counter.builder("stirling_cluster_sticky_miss_total")
                        .description(
                                "Sticky-session misses: a download for a job whose result lives on"
                                        + " a peer node landed on this node. High sustained value means"
                                        + " LB affinity is broken.")
                        .register(registry);
        this.rateLimitRejected =
                Counter.builder("stirling_cluster_ratelimit_rejected_total")
                        .description("Cluster-wide rate limit rejections")
                        .register(registry);
        this.backplaneLatency =
                Timer.builder("stirling_cluster_backplane_latency_seconds")
                        .description("Backplane round-trip latency")
                        .register(registry);
        this.jobWaitSeconds =
                Timer.builder("stirling_cluster_job_wait_seconds")
                        .description("Time jobs spend queued before execution")
                        .register(registry);
        Gauge.builder("stirling_cluster_jobs_inflight", jobsInflight, AtomicLong::doubleValue)
                .description("Jobs currently in flight on this node")
                .tag("node", applicationProperties.getCluster().resolvedNodeId())
                .register(registry);
        for (String lane : KNOWN_LANES) {
            ensureLaneGauge(lane);
        }
    }

    @Override
    public void recordStickyMiss() {
        stickyMissTotal.increment();
    }

    public void recordRateLimitReject() {
        rateLimitRejected.increment();
    }

    public Timer backplaneLatency() {
        return backplaneLatency;
    }

    public Timer jobWaitSeconds() {
        return jobWaitSeconds;
    }

    public void incrementInflight() {
        jobsInflight.incrementAndGet();
    }

    public void decrementInflight() {
        jobsInflight.decrementAndGet();
    }

    public void setQueueDepth(String lane, long depth) {
        ensureLaneGauge(lane).set(depth);
    }

    private AtomicLong ensureLaneGauge(String lane) {
        return queueDepth.computeIfAbsent(
                lane,
                l -> {
                    AtomicLong holder = new AtomicLong();
                    Gauge.builder("stirling_cluster_queue_depth", holder, AtomicLong::doubleValue)
                            .description("Pending items in a job queue lane")
                            .tag("lane", l)
                            .register(registry);
                    return holder;
                });
    }
}
