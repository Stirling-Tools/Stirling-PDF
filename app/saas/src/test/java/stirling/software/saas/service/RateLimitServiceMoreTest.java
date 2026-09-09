package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Branch-gap tests for {@link RateLimitService} that the deterministic-arithmetic suite cannot
 * reach without manipulating the clock: the actual eviction of an expired bucket in {@code
 * cleanupExpiredBuckets}, and the daily-cap rejection that rolls back the hourly counter.
 *
 * <p>These poke the two private {@code ConcurrentHashMap} buckets directly via reflection to seed
 * an already-expired or near-cap bucket, since the live windows are a fixed 1h / 1d and never
 * expire inside a test run.
 */
class RateLimitServiceMoreTest {

    private RateLimitService service;

    @BeforeEach
    void setUp() {
        service = new RateLimitService();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapField(String name) throws Exception {
        Field f = RateLimitService.class.getDeclaredField(name);
        f.setAccessible(true);
        return (Map<String, Object>) f.get(service);
    }

    private Object newBucket(int count, long resetTime) throws Exception {
        Class<?> bucketClass =
                Class.forName("stirling.software.saas.service.RateLimitService$RateLimitBucket");
        Constructor<?> ctor = bucketClass.getDeclaredConstructor(int.class, long.class);
        ctor.setAccessible(true);
        return ctor.newInstance(count, resetTime);
    }

    private int bucketCount(Object bucket) throws Exception {
        var m = bucket.getClass().getDeclaredMethod("getCount");
        m.setAccessible(true);
        return (int) m.invoke(bucket);
    }

    @Nested
    @DisplayName("cleanupExpiredBuckets - eviction path")
    class CleanupEviction {

        @Test
        @DisplayName("evicts buckets whose reset time has already passed")
        void evictsExpiredBuckets() throws Exception {
            long past = System.currentTimeMillis() - 1000L;
            mapField("hourlyLimits").put("team:1", newBucket(5, past));
            mapField("dailyLimits").put("team:1", newBucket(5, past));

            service.cleanupExpiredBuckets();

            assertThat(mapField("hourlyLimits")).doesNotContainKey("team:1");
            assertThat(mapField("dailyLimits")).doesNotContainKey("team:1");
        }

        @Test
        @DisplayName("evicts only expired buckets, leaving fresh ones in place")
        void evictsOnlyExpired() throws Exception {
            long past = System.currentTimeMillis() - 1000L;
            long future = System.currentTimeMillis() + 3_600_000L;
            mapField("hourlyLimits").put("team:expired", newBucket(5, past));
            mapField("hourlyLimits").put("team:fresh", newBucket(5, future));

            service.cleanupExpiredBuckets();

            assertThat(mapField("hourlyLimits"))
                    .doesNotContainKey("team:expired")
                    .containsKey("team:fresh");
        }
    }

    @Nested
    @DisplayName("allowInvitation - daily cap with hourly rollback")
    class DailyCapRollback {

        @Test
        @DisplayName("rejects at the daily cap and rolls back the hourly counter it just bumped")
        void dailyCapRejection_rollsBackHourly() throws Exception {
            long future = System.currentTimeMillis() + 3_600_000L;
            // Hourly fresh and well under cap; daily already at its 150 cap so the next bump trips.
            mapField("hourlyLimits").put("team:99", newBucket(1, future));
            mapField("dailyLimits").put("team:99", newBucket(150, future));

            boolean allowed = service.allowInvitation(99L);

            assertThat(allowed).isFalse();
            // Hourly was incremented to 2 by checkAndIncrement, then decremented back to 1.
            Object hourly = mapField("hourlyLimits").get("team:99");
            assertThat(bucketCount(hourly)).isEqualTo(1);
        }
    }
}
