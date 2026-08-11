package stirling.software.proprietary.cluster.valkey;

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
import org.junit.jupiter.api.Test;
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

    @Test
    @DisplayName("unhealthy when the probe yields no reply at all")
    void isHealthy_returnsFalseOnNullReply() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.hasKey(anyString())).thenReturn(null);

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
}
