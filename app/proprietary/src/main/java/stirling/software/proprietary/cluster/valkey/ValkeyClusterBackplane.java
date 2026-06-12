package stirling.software.proprietary.cluster.valkey;

import io.quarkus.arc.properties.IfBuildProperty;
import io.quarkus.redis.datasource.RedisDataSource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.model.ApplicationProperties;

// Build-time gating: this bean (and its RedisDataSource dependency) is only included in the build
// when cluster.backplane=valkey. With the default backplane (inprocess) the whole Valkey bean is
// removed, so RedisDataSource has no consumers and Quarkus emits no eager startup observer for the
// inactive Redis client - the in-process @DefaultBean ClusterBackplane satisfies the interface.
@Slf4j
@IfBuildProperty(name = "cluster.backplane", stringValue = "valkey")
@ApplicationScoped
public class ValkeyClusterBackplane implements ClusterBackplane {

    @Inject ApplicationProperties applicationProperties;

    // TODO: Migration required - was Spring spring-data-redis StringRedisTemplate. Replaced with
    // Quarkus RedisDataSource (io.quarkus.redis.datasource). Verify the redis client extension
    // (quarkus-redis-client) is on the classpath and configured via quarkus.redis.* properties.
    @Inject RedisDataSource redisDataSource;

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
