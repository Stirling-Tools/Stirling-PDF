package stirling.software.proprietary.cluster.valkey;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Publishes backplane reachability as the {@code valkeyBackplane} contributor of {@code
 * /actuator/health}. Without it a node whose Valkey is dead still reports UP, so a load balancer
 * keeps sending it traffic it cannot serve.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
public class ValkeyBackplaneHealthIndicator implements HealthIndicator {

    private final ValkeyClusterBackplane backplane;

    @Override
    public Health health() {
        try {
            Health.Builder builder = backplane.isHealthy() ? Health.up() : Health.down();
            return builder.withDetail("backplane", backplane.backplaneType())
                    .withDetail("nodeId", backplane.localNodeId())
                    .build();
        } catch (RuntimeException ex) {
            // isHealthy() swallows its own probe errors; this covers node-id resolution failing.
            return Health.down(ex).withDetail("backplane", backplane.backplaneType()).build();
        }
    }
}
