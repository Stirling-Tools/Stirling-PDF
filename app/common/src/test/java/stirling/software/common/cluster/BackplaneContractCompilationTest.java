package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class BackplaneContractCompilationTest {

    @Test
    void jobStoreEntryRecordRoundTrips() {
        Instant now = Instant.now();
        JobStoreEntry entry =
                new JobStoreEntry(
                        "job-1",
                        JobStoreEntry.JobState.PENDING,
                        "node-a",
                        now,
                        null,
                        null,
                        List.of("file-1"),
                        Map.of("k", "v"));
        assertEquals("job-1", entry.jobId());
        assertEquals(JobStoreEntry.JobState.PENDING, entry.state());
        assertEquals("node-a", entry.owningNodeId());
        assertEquals(now, entry.createdAt());
        assertEquals(List.of("file-1"), entry.fileIds());
        assertEquals("v", entry.resultMeta().get("k"));
    }

    @Test
    void clusterNodeRecordRoundTrips() {
        Instant heartbeat = Instant.now();
        ClusterNode node = new ClusterNode("node-a", "10.0.0.1:8080", heartbeat, "BOTH");
        assertEquals("node-a", node.nodeId());
        assertEquals("10.0.0.1:8080", node.internalAddress());
        assertEquals(heartbeat, node.lastHeartbeat());
        assertEquals("BOTH", node.role());
    }

    @Test
    void rateLimitDecisionRecordRoundTrips() {
        RateLimitStore.RateLimitDecision d = new RateLimitStore.RateLimitDecision(true, 7, 0L);
        assertEquals(true, d.allowed());
        assertEquals(7, d.remainingTokens());
        assertEquals(0L, d.nanosToWaitForRefill());
    }
}
