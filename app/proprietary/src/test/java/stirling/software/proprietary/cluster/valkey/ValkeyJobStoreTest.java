package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;

class ValkeyJobStoreTest {

    private static final String INDEX_KEY = "stirling:file2job:file-a";

    private static JobStoreEntry entry() {
        return new JobStoreEntry(
                "job-1",
                JobState.COMPLETE,
                "node-1",
                Instant.EPOCH,
                Instant.EPOCH,
                null,
                List.of("file-a"),
                Map.of());
    }

    @Test
    @DisplayName("a non-positive TTL removes the index row through the ownership guard, not DEL")
    void expiredOnWriteUsesTheValueGuardedDelete() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);

        // stirling.jobResultExpiryMinutes=0 reaches put() with an already-expired entry.
        new ValkeyJobStore(template).put(entry(), Duration.ZERO);

        @SuppressWarnings("rawtypes")
        ArgumentCaptor<RedisScript> script = ArgumentCaptor.forClass(RedisScript.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> keys = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Object> args = ArgumentCaptor.forClass(Object.class);
        verify(template).execute(script.capture(), keys.capture(), args.capture());

        assertEquals(List.of(INDEX_KEY), keys.getValue());
        assertEquals("job-1", args.getValue());
        assertTrue(
                script.getValue().getScriptAsString().contains("get"),
                "the index row must be removed only while this job still owns it");
        // An unguarded DEL here would drop an index row a newer job already claimed.
        verify(template, never()).delete(INDEX_KEY);
        verify(template).delete("stirling:job:job-1");
    }

    @Test
    @DisplayName("a live TTL writes the index row with that TTL and deletes nothing")
    void liveTtlWritesTheIndexRow() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(template.opsForValue()).thenReturn(values);

        new ValkeyJobStore(template).put(entry(), Duration.ofMinutes(5));

        verify(values).set(INDEX_KEY, "job-1", Duration.ofMinutes(5));
        verify(template, never()).delete(anyString());
    }
}
