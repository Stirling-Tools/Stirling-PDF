package stirling.software.proprietary.cluster.valkey;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import io.quarkus.redis.datasource.RedisDataSource;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.model.ApplicationProperties;

@Slf4j
@ApplicationScoped
// TODO: Migration required - @ConditionalOnValkeyBackplane was a Spring @ConditionalOnExpression
// guard ("cluster.enabled=true AND cluster.backplane=valkey"). Quarkus has no runtime
// @Conditional for beans; this bean is now always instantiated. Gate selection at runtime
// (e.g. a ClusterBackplane producer that picks valkey vs in-process based on injected config),
// or use @io.quarkus.arc.lookup.LookupIfProperty(name="cluster.backplane", stringValue="valkey")
// (build-time/static only - does not also check cluster.enabled). The composite condition must be
// re-expressed accordingly.
public class ValkeyClusterBackplane implements ClusterBackplane {

    @Inject
    ApplicationProperties applicationProperties;

    // TODO: Migration required - was Spring spring-data-redis StringRedisTemplate. Replaced with
    // Quarkus RedisDataSource (io.quarkus.redis.datasource). Verify the redis client extension
    // (quarkus-redis-client) is on the classpath and configured via quarkus.redis.* properties.
    @Inject
    RedisDataSource redisDataSource;

    @Override
    public boolean isHealthy() {
        try {
            // Original used template.execute() so the connection was borrowed from the pool and
            // returned in a finally block - critical because isHealthy() is hit on every k8s
            // liveness/readiness probe tick. Quarkus RedisDataSource manages connection
            // pooling/return internally, so issuing a single command (PING) is the equivalent.
            // TODO: Migration required - confirm command mapping. Quarkus exposes PING via the
            // low-level command API: redisDataSource.execute("PING") returns a Response whose
            // toString() is the simple-string reply "PONG". Validate this against the actual
            // RedisDataSource API version in use.
            String pong = redisDataSource.execute("PING").toString();
            return "PONG".equalsIgnoreCase(pong);
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
