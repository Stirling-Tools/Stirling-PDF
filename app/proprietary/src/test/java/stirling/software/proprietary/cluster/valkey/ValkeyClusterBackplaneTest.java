package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;

import stirling.software.common.model.ApplicationProperties;

/**
 * S3 regression: {@link ValkeyClusterBackplane#isHealthy()} must route through {@code
 * template.execute(...)} so the borrowed connection is always returned to the pool. Calling {@code
 * getConnectionFactory().getConnection()} directly would leak the connection on every k8s liveness
 * probe tick and exhaust the pool under monitoring load.
 */
class ValkeyClusterBackplaneTest {

    @Test
    void isHealthy_routesThroughTemplateExecute_andDoesNotTouchConnectionFactoryDirectly() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.execute(any(RedisCallback.class))).thenReturn("PONG");

        ApplicationProperties props = new ApplicationProperties();
        props.getCluster().getNode().setId("n-1");
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(props, template);

        assertTrue(bp.isHealthy());
        verify(template, times(1)).execute(any(RedisCallback.class));
        // Critical: never bypass the template's connection management.
        verify(template, never()).getConnectionFactory();
    }

    @Test
    void isHealthy_returnsFalseWhenExecuteThrows() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.execute(any(RedisCallback.class))).thenThrow(new RuntimeException("boom"));

        ApplicationProperties props = new ApplicationProperties();
        props.getCluster().getNode().setId("n-1");
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(props, template);

        assertFalse(bp.isHealthy());
    }

    @Test
    void shouldRunLocalCleanup_returnsFalse_valkeyOwnsTtlEviction() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        ApplicationProperties props = new ApplicationProperties();
        props.getCluster().getNode().setId("n-1");
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(props, template);
        assertFalse(bp.shouldRunLocalCleanup());
    }
}
