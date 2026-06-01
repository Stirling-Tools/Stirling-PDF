package stirling.software.common.cluster.inprocess;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
@Slf4j
@Configuration
@ConditionalOnExpression(
        "!${cluster.enabled:false} ||"
                + " '${cluster.backplane:inprocess}'.equalsIgnoreCase('inprocess')")
public class InProcessClusterConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ClusterBackplane clusterBackplane(ApplicationProperties applicationProperties) {
        log.info("Cluster backplane: in-process (single node)");
        return new InProcessClusterBackplane(applicationProperties);
    }

    @Bean
    @ConditionalOnMissingBean
    public JobStore jobStore() {
        return new InProcessJobStore();
    }

    @Bean
    @ConditionalOnMissingBean
    public RateLimitStore rateLimitStore() {
        return new InProcessRateLimitStore();
    }

    @Bean
    @ConditionalOnMissingBean
    public DistributedLock distributedLock() {
        return new InProcessDistributedLock();
    }

    @Bean
    @ConditionalOnMissingBean
    public KeyValueCache keyValueCache() {
        return new InProcessKeyValueCache();
    }

    @Bean
    @ConditionalOnMissingBean
    public InstanceRegistry instanceRegistry() {
        return new InProcessInstanceRegistry();
    }
}
