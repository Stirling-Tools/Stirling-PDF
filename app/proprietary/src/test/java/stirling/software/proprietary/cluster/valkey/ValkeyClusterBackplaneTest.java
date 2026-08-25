package stirling.software.proprietary.cluster.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;

import stirling.software.common.model.ApplicationProperties;

// The probe must be a single-key command via the template: PING fans out to every cluster
// master and fails if any one node is down, restarting healthy pods on each liveness tick.
class ValkeyClusterBackplaneTest {

    private static ValkeyClusterBackplane backplane(StringRedisTemplate template) {
        ApplicationProperties props = new ApplicationProperties();
        props.getCluster().getNode().setId("n-1");
        return new ValkeyClusterBackplane(props, template);
    }

    @Test
    @DisplayName("healthy when the single-key probe answers; PING is never issued")
    void isHealthy_usesSingleKeyProbe_andNeverPings() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.hasKey(anyString())).thenReturn(Boolean.FALSE);

        assertTrue(backplane(template).isHealthy());

        // The signal is "the command completed", not the boolean - the key is never written.
        verify(template, times(1)).hasKey("stirling:health:n-1");
        // Critical: a PING would fan out across a cluster and never bypass the template.
        verify(template, never()).execute(any(RedisCallback.class));
        verify(template, never()).getConnectionFactory();
    }

    // Replaces an assertion on a null hasKey() reply: Lettuce only returns null while queueing
    // inside a pipeline or MULTI, and this template is neither, so that branch was unreachable.
    @Test
    @DisplayName("healthy whichever boolean the probe returns - only the round trip matters")
    void isHealthy_ignoresProbeReplyValue() {
        StringRedisTemplate exists = mock(StringRedisTemplate.class);
        when(exists.hasKey(anyString())).thenReturn(Boolean.TRUE);
        assertTrue(backplane(exists).isHealthy());

        StringRedisTemplate missing = mock(StringRedisTemplate.class);
        when(missing.hasKey(anyString())).thenReturn(Boolean.FALSE);
        assertTrue(backplane(missing).isHealthy());
    }

    @Test
    @DisplayName("unhealthy when the connection to Valkey is down")
    void isHealthy_returnsFalseOnConnectionFailure() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        // The exception a real outage surfaces, rather than a synthetic RuntimeException.
        when(template.hasKey(anyString()))
                .thenThrow(new RedisConnectionFailureException("connection refused"));

        assertFalse(backplane(template).isHealthy());
    }

    @Test
    @DisplayName("unhealthy (not propagated) when the probe throws")
    void isHealthy_returnsFalseWhenProbeThrows() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.hasKey(anyString())).thenThrow(new RuntimeException("boom"));

        assertFalse(backplane(template).isHealthy());
    }

    @Test
    void shouldRunLocalCleanup_returnsFalse_valkeyOwnsTtlEviction() {
        assertFalse(backplane(mock(StringRedisTemplate.class)).shouldRunLocalCleanup());
    }

    @Nested
    @DisplayName("health indicator")
    class BackplaneHealthIndicator {

        private final ApplicationContextRunner runner =
                new ApplicationContextRunner()
                        .withUserConfiguration(ValkeyBackplaneHealthIndicator.class);

        private static Health health(StringRedisTemplate template) {
            return new ValkeyBackplaneHealthIndicator(backplane(template)).health();
        }

        @Test
        @DisplayName("UP with backplane and node details when the probe answers")
        void reportsUp() {
            StringRedisTemplate template = mock(StringRedisTemplate.class);
            when(template.hasKey(anyString())).thenReturn(Boolean.FALSE);

            Health health = health(template);

            assertEquals(Status.UP, health.getStatus());
            assertEquals("valkey", health.getDetails().get("backplane"));
            assertEquals("n-1", health.getDetails().get("nodeId"));
        }

        @Test
        @DisplayName("DOWN when Valkey is unreachable, so the node drops out of rotation")
        void reportsDownOnOutage() {
            StringRedisTemplate template = mock(StringRedisTemplate.class);
            when(template.hasKey(anyString()))
                    .thenThrow(new RedisConnectionFailureException("connection refused"));

            Health health = health(template);

            assertEquals(Status.DOWN, health.getStatus());
            assertEquals("valkey", health.getDetails().get("backplane"));
        }

        @Test
        @DisplayName("DOWN rather than throwing when node-id resolution fails")
        void reportsDownInsteadOfPropagating() {
            ValkeyClusterBackplane broken = mock(ValkeyClusterBackplane.class);
            when(broken.isHealthy()).thenReturn(true);
            when(broken.backplaneType()).thenReturn("valkey");
            when(broken.localNodeId()).thenThrow(new IllegalStateException("no node id"));

            Health health = new ValkeyBackplaneHealthIndicator(broken).health();

            assertEquals(Status.DOWN, health.getStatus());
        }

        @Test
        @DisplayName("not registered on a single-node install")
        void absentWhenClusterDisabled() {
            runner.run(
                    context ->
                            assertThat(context)
                                    .doesNotHaveBean(ValkeyBackplaneHealthIndicator.class));
        }

        @Test
        @DisplayName("not registered when clustering uses the in-process backplane")
        void absentWhenBackplaneIsInProcess() {
            runner.withPropertyValues("cluster.enabled=true", "cluster.backplane=inprocess")
                    .run(
                            context ->
                                    assertThat(context)
                                            .doesNotHaveBean(ValkeyBackplaneHealthIndicator.class));
        }

        @Test
        @DisplayName("registered when the Valkey backplane is active")
        void presentWhenValkeyBackplaneActive() {
            runner.withPropertyValues("cluster.enabled=true", "cluster.backplane=valkey")
                    .withBean(
                            ValkeyClusterBackplane.class,
                            () -> backplane(mock(StringRedisTemplate.class)))
                    .run(
                            context ->
                                    assertThat(context)
                                            .hasSingleBean(ValkeyBackplaneHealthIndicator.class));
        }
    }
}
