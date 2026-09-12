package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.invocation.Invocation;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;

class ValkeyJobStoreTest {

    private static final String INDEX_KEY = "stirling:file2job:file-a";
    private static final String JOB_KEY = "stirling:job:job-1";

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
    @DisplayName("a live TTL writes the job hash and the index row with that TTL, deleting nothing")
    void liveTtlWritesTheJobHashAndIndexRow() {
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(template.opsForValue()).thenReturn(values);

        new ValkeyJobStore(template).put(entry(), Duration.ofMinutes(5));

        // Shape-agnostic: a row may be written by its own command or by one multi-key script.
        List<String> writtenKeys = new ArrayList<>();
        List<String> writtenArgs = new ArrayList<>();
        for (Invocation invocation : mockingDetails(template).getInvocations()) {
            Object[] raw = invocation.getRawArguments();
            if (!"execute".equals(invocation.getMethod().getName()) || raw.length < 3) {
                continue;
            }
            if (raw[1] instanceof List<?> keys && raw[2] instanceof Object[] args) {
                keys.forEach(key -> writtenKeys.add(String.valueOf(key)));
                for (Object arg : args) {
                    writtenArgs.add(String.valueOf(arg));
                }
            }
        }

        String ttlMillis = Long.toString(Duration.ofMinutes(5).toMillis());
        assertTrue(writtenKeys.contains(JOB_KEY), "put() must write the job hash, not just index");
        assertTrue(writtenArgs.contains(ttlMillis), "the job hash must be written with its TTL");
        assertTrue(
                writtenArgs.containsAll(List.of("jobId", "job-1", "state", "COMPLETE")),
                "the job hash must carry the entry's fields");

        ArgumentCaptor<String> setKey = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> setValue = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Duration> setTtl = ArgumentCaptor.forClass(Duration.class);
        verify(values, atLeast(0)).set(setKey.capture(), setValue.capture(), setTtl.capture());
        boolean indexSetPx =
                setKey.getAllValues().contains(INDEX_KEY)
                        && setValue.getAllValues().contains("job-1")
                        && setTtl.getAllValues().contains(Duration.ofMinutes(5));
        assertTrue(
                indexSetPx || writtenKeys.contains(INDEX_KEY),
                "put() must write the file index row");
        verify(template, never()).delete(anyString());
    }
}
