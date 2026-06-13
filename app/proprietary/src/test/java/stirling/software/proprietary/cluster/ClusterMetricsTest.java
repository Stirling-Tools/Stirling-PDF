package stirling.software.proprietary.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.model.ApplicationProperties;

/** Verifies every cluster metric is registered and recorder methods write to them. */
class ClusterMetricsTest {

    private SimpleMeterRegistry registry;
    private ClusterMetrics metrics;
    private static final String NODE = "test-node";

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        ApplicationProperties props = new ApplicationProperties();
        props.getCluster().getNode().setId(NODE);
        metrics = new ClusterMetrics(registry, props);
    }

    @Test
    void registersAllRequiredMeters() {
        assertNotNull(registry.find("stirling_cluster_sticky_miss_total").counter());
        assertNotNull(registry.find("stirling_cluster_ratelimit_rejected_total").counter());
        assertNotNull(registry.find("stirling_cluster_backplane_latency_seconds").timer());
        assertNotNull(registry.find("stirling_cluster_job_wait_seconds").timer());
        Gauge inflight = registry.find("stirling_cluster_jobs_inflight").tag("node", NODE).gauge();
        assertNotNull(inflight, "jobs_inflight gauge with node tag must be registered eagerly");
    }

    @Test
    void registersKnownLaneGaugesEagerly() {
        for (String lane : new String[] {"FAST", "SLOW", "AI"}) {
            Gauge g = registry.find("stirling_cluster_queue_depth").tag("lane", lane).gauge();
            assertNotNull(g, "lane gauge must be eagerly registered for " + lane);
            assertEquals(0.0, g.value(), "lane gauge default value must be 0 for " + lane);
        }
        assertEquals(
                3,
                registry.find("stirling_cluster_queue_depth").gauges().size(),
                "exactly the three known lane gauges should be registered at boot");
    }

    @Test
    void recordStickyMissIncrementsCounter() {
        metrics.recordStickyMiss();
        metrics.recordStickyMiss();
        assertEquals(2.0, registry.find("stirling_cluster_sticky_miss_total").counter().count());
    }

    @Test
    void recordRateLimitRejectIncrementsCounter() {
        metrics.recordRateLimitReject();
        assertEquals(
                1.0, registry.find("stirling_cluster_ratelimit_rejected_total").counter().count());
    }

    @Test
    void incrementAndDecrementInflightUpdatesGauge() {
        metrics.incrementInflight();
        metrics.incrementInflight();
        metrics.incrementInflight();
        metrics.decrementInflight();
        Gauge gauge = registry.find("stirling_cluster_jobs_inflight").tag("node", NODE).gauge();
        assertEquals(2.0, gauge.value(), "expected 2 inflight after 3 inc / 1 dec");
    }

    @Test
    void setQueueDepthUpdatesEagerlyRegisteredLaneGauge() {
        metrics.setQueueDepth("FAST", 4);
        metrics.setQueueDepth("SLOW", 7);

        Gauge fast = registry.find("stirling_cluster_queue_depth").tag("lane", "FAST").gauge();
        Gauge slow = registry.find("stirling_cluster_queue_depth").tag("lane", "SLOW").gauge();
        assertEquals(4.0, fast.value());
        assertEquals(7.0, slow.value());
    }

    @Test
    void setQueueDepthForUnknownLane_lazyRegistersFallbackGauge() {
        metrics.setQueueDepth("custom-lane", 5);
        Gauge g = registry.find("stirling_cluster_queue_depth").tag("lane", "custom-lane").gauge();
        assertNotNull(g);
        assertEquals(5.0, g.value());
    }

    @Test
    void setQueueDepthIsIdempotentAcrossCalls() {
        metrics.setQueueDepth("FAST", 1);
        metrics.setQueueDepth("FAST", 2);
        metrics.setQueueDepth("FAST", 9);

        assertEquals(
                1,
                registry.find("stirling_cluster_queue_depth").tag("lane", "FAST").gauges().size());
        assertEquals(
                9.0,
                registry.find("stirling_cluster_queue_depth").tag("lane", "FAST").gauge().value());
    }

    @Test
    void backplaneLatencyTimerAcceptsRecordings() {
        metrics.backplaneLatency().record(java.time.Duration.ofMillis(7));
        metrics.backplaneLatency().record(java.time.Duration.ofMillis(11));
        assertEquals(
                2L, registry.find("stirling_cluster_backplane_latency_seconds").timer().count());
    }

    @Test
    void jobWaitTimerAcceptsRecordings() {
        metrics.jobWaitSeconds().record(java.time.Duration.ofMillis(50));
        assertEquals(1L, registry.find("stirling_cluster_job_wait_seconds").timer().count());
    }
}
