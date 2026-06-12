package stirling.software.common.cluster.inprocess;

import io.quarkus.arc.DefaultBean;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.InstanceRegistry;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.model.ApplicationProperties;

/**
 * Default cluster backplane wiring: every interface gets an {@code InProcess*} bean. Active when
 * cluster mode is off or {@code cluster.backplane=inprocess}.
 */
// TODO: Migration required - the original @ConditionalOnExpression
// ("!${cluster.enabled:false} || '${cluster.backplane:inprocess}'.equalsIgnoreCase('inprocess')")
// gated activation of this whole configuration on a SpEL expression over two config properties.
// Quarkus/CDI has no direct equivalent for conditionally registering a producer set based on a
// SpEL boolean. The @DefaultBean producers below now always provide the in-process implementations
// unless another bean of the same type is present. If a non-inprocess backplane is added, ensure
// it is NOT a @DefaultBean so it wins, and consider gating with
// @io.quarkus.arc.lookup.LookupIfProperty
// / @io.quarkus.arc.lookup.LookupUnlessProperty or a build-time @IfBuildProperty per producer.
@Slf4j
@ApplicationScoped
public class InProcessClusterConfiguration {

    @Produces
    @DefaultBean
    @ApplicationScoped
    public ClusterBackplane clusterBackplane(ApplicationProperties applicationProperties) {
        log.info("Cluster backplane: in-process (single node)");
        return new InProcessClusterBackplane(applicationProperties);
    }

    @Produces
    @DefaultBean
    @ApplicationScoped
    public JobStore jobStore() {
        return new InProcessJobStore();
    }

    @Produces
    @DefaultBean
    @ApplicationScoped
    public RateLimitStore rateLimitStore() {
        return new InProcessRateLimitStore();
    }

    @Produces
    @DefaultBean
    @ApplicationScoped
    public DistributedLock distributedLock() {
        return new InProcessDistributedLock();
    }

    @Produces
    @DefaultBean
    @ApplicationScoped
    public KeyValueCache keyValueCache() {
        return new InProcessKeyValueCache();
    }

    @Produces
    @DefaultBean
    @ApplicationScoped
    public InstanceRegistry instanceRegistry() {
        return new InProcessInstanceRegistry();
    }
}
