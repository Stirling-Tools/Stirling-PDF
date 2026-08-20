package stirling.software.proprietary.cluster.valkey;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
public class ValkeyClusterBackplane implements ClusterBackplane {

    private final ApplicationProperties applicationProperties;
    private final StringRedisTemplate template;

    @Override
    public boolean isHealthy() {
        try {
            // Single-key EXISTS, not PING: on Cluster spring-data fans PING to every node and
            // fails if any is down. The key need not exist; a completed round trip is the signal.
            return template.hasKey("stirling:health:" + localNodeId()) != null;
        } catch (RuntimeException ex) {
            log.warn("Valkey backplane health check failed: {}", ex.getMessage());
            return false;
        }
    }

    @Override
    public String backplaneType() {
        return "valkey";
    }

    @Override
    public String localNodeId() {
        return applicationProperties.getCluster().resolvedNodeId();
    }

    /**
     * Valkey TTL evicts job entries; local cleanup loop is redundant and would race with cluster
     * state.
     */
    @Override
    public boolean shouldRunLocalCleanup() {
        return false;
    }
}
