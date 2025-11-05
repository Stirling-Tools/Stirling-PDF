package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Comprehensive tests for AttemptCounter. Notes: - We avoid timing flakiness by using generous
 * windows or setting lastAttemptTime to 'now'. - Where assumptions are made about edge-case
 * behavior, they are documented in comments.
 */
class AttemptCounterTest {

    // --- Helper functions for reflection access to private fields ---

    private static void setPrivateLong(Object target, String fieldName, long value) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            f.setLong(target, value);
        } catch (Exception e) {
            fail("Could not set field '" + fieldName + "': " + e.getMessage());
        }
    }

    private static void setPrivateInt(Object target, String fieldName, int value) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            f.setInt(target, value);
        } catch (Exception e) {
            fail("Could not set field '" + fieldName + "': " + e.getMessage());
        }
    }

    private static long getPrivateLong(Object target, String fieldName) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            return f.getLong(target);
        } catch (Exception e) {
            fail("Could not read field '" + fieldName + "': " + e.getMessage());
            return -1L; // unreachable
        }
    }

    // --- Tests ---

    @Test
    @DisplayName("Constructor: attemptCount=0 and lastAttemptTime within creation period")
    void constructor_shouldInitializeFields() {
        long before = System.currentTimeMillis();
        AttemptCounter counter = new AttemptCounter();
        long after = System.currentTimeMillis();

        // Purpose: Ensure that count is 0 and the timestamp lies in the [before, after] window
        assertAll(
                () -> assertEquals(0, counter.getAttemptCount(), "attemptCount should be 0"),
                () -> {
                    long ts = counter.getLastAttemptTime();
                    assertTrue(
                            ts >= before && ts <= after,
                            "lastAttemptTime should be between constructor start and end");
                });
    }

    @Test
    @DisplayName(
            "increment(): increases attemptCount and updates lastAttemptTime (not less than"
                    + " before)")
    void increment_shouldIncreaseCountAndUpdateTime() {
        AttemptCounter counter = new AttemptCounter();
        long prevTime = counter.getLastAttemptTime();

        counter.increment();

        // Purpose: After increment, count is +1 and timestamp is not older than before
        assertAll(
                () -> assertEquals(1, counter.getAttemptCount(), "attemptCount should be 1"),
                () ->
                        assertTrue(
                                counter.getLastAttemptTime() >= prevTime,
                                "lastAttemptTime should not be less after increment"));
    }

    @Test
    @DisplayName("reset(): sets attemptCount to 0 and updates lastAttemptTime")
    void reset_shouldZeroCountAndRefreshTime() {
        AttemptCounter counter = new AttemptCounter();
        counter.increment();
        counter.increment();
        long beforeReset = counter.getLastAttemptTime();

        counter.reset();

        // Purpose: Ensure the counter is reset and time is updated
        assertAll(
                () ->
                        assertEquals(
                                0,
                                counter.getAttemptCount(),
                                "attemptCount should be 0 after reset"),
                () ->
                        assertTrue(
                                counter.getLastAttemptTime() >= beforeReset,
                                "lastAttemptTime should be updated after reset (>= previous)"));
    }

    @Nested
    @DisplayName("shouldReset(attemptIncrementTime)")
    class ShouldResetTests {

        @Test
        @DisplayName("returns FALSE when time difference is smaller than window")
        void shouldReturnFalseWhenWithinWindow() {
            AttemptCounter counter = new AttemptCounter();
            long window = 5_000L; // 5 seconds - generous buffer to avoid timing flakiness
            long now = System.currentTimeMillis();

            // Changed: Avoid flaky 1ms margin. We set lastAttemptTime to 'now' and choose a large
            // window so elapsed < window is reliably true despite scheduling/clock granularity.
            // Changed: Reason for change -> eliminate timing flakiness that caused sporadic
            // failures.
            setPrivateLong(counter, "lastAttemptTime", now);

            // Purpose: Inside the window -> no reset
            assertFalse(counter.shouldReset(window), "Within the window, no reset should occur");
        }

        @Test
        @DisplayName("returns TRUE when time difference is exactly equal to window")
        void shouldReturnTrueWhenExactlyWindow() {
            AttemptCounter counter = new AttemptCounter();
            long window = 200L;
            long now = System.currentTimeMillis();

            // Simulate: last action was exactly 'window' ms ago
            setPrivateLong(counter, "lastAttemptTime", now - window);

            // Purpose: Equality -> reset should occur because the window has fully elapsed
            assertTrue(
                    counter.shouldReset(window),
                    "With exactly equal difference, the reset window has elapsed");
        }

        @Test
        @DisplayName("returns TRUE when time difference is greater than window")
        void shouldReturnTrueWhenGreaterThanWindow() {
            AttemptCounter counter = new AttemptCounter();
            long window = 100L;
            long now = System.currentTimeMillis();

            // Simulate: last action was (window + 1) ms ago
            setPrivateLong(counter, "lastAttemptTime", now - (window + 1));

            // Purpose: Outside the window -> reset
            assertTrue(counter.shouldReset(window), "Outside the window, reset should occur");
        }
    }

    @Nested
    @DisplayName("shouldReset(attemptIncrementTime) – additional edge cases")
    class AdditionalEdgeCases {

        @Test
        @DisplayName("returns TRUE when window is zero (elapsed >= 0 is always true)")
        void shouldReset_shouldReturnTrueWhenWindowIsZero() {
            AttemptCounter counter = new AttemptCounter();
            // Set lastAttemptTime == now to avoid timing flakiness
            long now = System.currentTimeMillis();
            setPrivateLong(counter, "lastAttemptTime", now);

            // Assumption/Documentation: current implementation uses 'elapsed >=
            // attemptIncrementTime'
            // With attemptIncrementTime == 0, condition is always true.
            assertTrue(counter.shouldReset(0L), "Window=0 means the window has already elapsed");
        }

        @Test
        @DisplayName("returns TRUE when window is negative (elapsed >= negative is always true)")
        void shouldReset_shouldReturnTrueWhenWindowIsNegative() {
            AttemptCounter counter = new AttemptCounter();
            long now = System.currentTimeMillis();
            setPrivateLong(counter, "lastAttemptTime", now);

            // Assumption/Documentation: Negative window is treated as already elapsed.
            assertTrue(
                    counter.shouldReset(-1L),
                    "Negative window is nonsensical and should result in reset=true (elapsed >="
                            + " negative)");
        }
    }

    @Test
    @DisplayName("Getters: return current values")
    void getters_shouldReturnCurrentValues() {
        AttemptCounter counter = new AttemptCounter();
        assertAll(
                // Purpose: Basic getter functionality
                () ->
                        assertEquals(
                                0, counter.getAttemptCount(), "Initial attemptCount should be 0"),
                () ->
                        assertTrue(
                                counter.getLastAttemptTime() <= System.currentTimeMillis(),
                                "lastAttemptTime should not be in the future"));

        counter.increment();
        int afterInc = counter.getAttemptCount();
        long last = counter.getLastAttemptTime();

        assertAll(
                // Purpose: After increment, getters reflect the new state
                () -> assertEquals(1, afterInc, "attemptCount should be 1 after increment"),
                () ->
                        assertEquals(
                                last,
                                counter.getLastAttemptTime(),
                                "lastAttemptTime should be consistent"));
    }

    @Test
    @DisplayName(
            "Multiple increments(): Count increases monotonically and timestamp remains"
                    + " monotonically non-decreasing")
    void multipleIncrements_shouldIncreaseMonotonically() {
        AttemptCounter counter = new AttemptCounter();
        long t1 = counter.getLastAttemptTime();

        counter.increment();
        long t2 = counter.getLastAttemptTime();

        counter.increment();
        long t3 = counter.getLastAttemptTime();

        // Purpose: Document monotonic behavior
        assertAll(
                () ->
                        assertEquals(
                                2,
                                counter.getAttemptCount(),
                                "After two increments, count should be 2"),
                () ->
                        assertTrue(
                                t2 >= t1 && t3 >= t2,
                                "Timestamps should be monotonically non-decreasing"));
    }

    @Test
    @DisplayName("Documenting edge case: attemptCount can technically overflow (int)")
    void noteOnIntegerOverflowBehavior() {
        // Note: This test only documents the current behavior of int overflow in Java.
        // It does not enforce that overflow is desired, only makes visible what happens.
        AttemptCounter counter = new AttemptCounter();

        // Set counter close to Integer.MAX_VALUE and increment()
        setPrivateInt(counter, "attemptCount", Integer.MAX_VALUE - 1);
        counter.increment(); // -> MAX_VALUE
        assertEquals(
                Integer.MAX_VALUE,
                counter.getAttemptCount(),
                "Count should reach Integer.MAX_VALUE");

        counter.increment(); // -> overflow to Integer.MIN_VALUE
        assertEquals(
                Integer.MIN_VALUE,
                counter.getAttemptCount(),
                "After increment past MAX_VALUE, int overflows to MIN_VALUE (Java standard"
                        + " behavior)");
    }

    @Test
    @DisplayName("Reflection: getPrivateLong reads the actual lastAttemptTime")
    void reflectionGetter_shouldReturnInternalValue() {
        AttemptCounter counter = new AttemptCounter();
        long expected = counter.getLastAttemptTime();
        long reflected = getPrivateLong(counter, "lastAttemptTime");

        assertEquals(expected, reflected, "Reflection getter should match the field value");
    }
}
