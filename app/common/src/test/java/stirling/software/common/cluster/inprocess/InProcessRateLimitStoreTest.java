package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;

class InProcessRateLimitStoreTest {

    @Test
    void firstNConsumesAllowed() {
        RateLimitStore store = new InProcessRateLimitStore();
        for (int i = 0; i < 5; i++) {
            assertTrue(store.tryConsume("k", 5, Duration.ofSeconds(60)).allowed(), "i=" + i);
        }
        assertFalse(store.tryConsume("k", 5, Duration.ofSeconds(60)).allowed());
    }

    @Test
    void remainingTokensDecrements() {
        RateLimitStore store = new InProcessRateLimitStore();
        RateLimitDecision d1 = store.tryConsume("k", 5, Duration.ofSeconds(60));
        RateLimitDecision d2 = store.tryConsume("k", 5, Duration.ofSeconds(60));
        assertTrue(d1.allowed());
        assertTrue(d2.allowed());
        assertEquals(4, d1.remainingTokens());
        assertEquals(3, d2.remainingTokens());
    }

    @Test
    void refillRestoresTokens() throws InterruptedException {
        RateLimitStore store = new InProcessRateLimitStore();
        // Capacity 2 with smooth refill over 100 ms -> ~1 token per 50 ms.
        for (int i = 0; i < 2; i++) {
            assertTrue(store.tryConsume("k", 2, Duration.ofMillis(100)).allowed());
        }
        assertFalse(store.tryConsume("k", 2, Duration.ofMillis(100)).allowed());
        Thread.sleep(150);
        assertTrue(store.tryConsume("k", 2, Duration.ofMillis(100)).allowed());
    }

    @Test
    void deniedConsumeReportsWaitNanos() {
        RateLimitStore store = new InProcessRateLimitStore();
        assertTrue(store.tryConsume("wait", 1, Duration.ofSeconds(10)).allowed());
        RateLimitDecision denied = store.tryConsume("wait", 1, Duration.ofSeconds(10));
        assertFalse(denied.allowed());
        assertTrue(denied.nanosToWaitForRefill() > 0L);
    }
}
