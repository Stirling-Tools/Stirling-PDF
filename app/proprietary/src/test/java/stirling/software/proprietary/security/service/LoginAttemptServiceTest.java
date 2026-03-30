package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.proprietary.security.model.AttemptCounter;

/**
 * Tests for LoginAttemptService#getRemainingAttempts(...) focusing on edge cases and documented
 * behavior. We instantiate the service reflectively to avoid depending on a specific constructor
 * signature. Private fields are set via reflection to keep existing production code unchanged.
 *
 * <p>Assumptions: - 'MAX_ATTEMPT' is a private int (possibly static final); we read it via
 * reflection (static-aware). - 'attemptsCache' is a ConcurrentHashMap<String, AttemptCounter>. -
 * 'isBlockedEnabled' is a boolean flag. - Behavior without clamping is intentional for now (can
 * return negative values).
 */
class LoginAttemptServiceTest {

    // --- Reflection helpers ---

    private static Object constructLoginAttemptService() {
        try {
            Class<?> clazz =
                    Class.forName(
                            "stirling.software.proprietary.security.service.LoginAttemptService");
            // Prefer a no-arg constructor if present; otherwise use the first and mock parameters.
            Constructor<?>[] ctors = clazz.getDeclaredConstructors();
            Arrays.stream(ctors).forEach(c -> c.setAccessible(true));

            Constructor<?> target =
                    Arrays.stream(ctors)
                            .filter(c -> c.getParameterCount() == 0)
                            .findFirst()
                            .orElse(ctors[0]);

            Object[] args = new Object[target.getParameterCount()];
            Class<?>[] paramTypes = target.getParameterTypes();
            for (int i = 0; i < paramTypes.length; i++) {
                Class<?> p = paramTypes[i];
                if (p.isPrimitive()) {
                    // Provide basic defaults for primitives
                    args[i] = defaultValueForPrimitive(p);
                } else {
                    args[i] = Mockito.mock(p);
                }
            }
            return target.newInstance(args);
        } catch (Exception e) {
            fail("Could not construct LoginAttemptService reflectively: " + e.getMessage());
            return null; // unreachable
        }
    }

    private static Object defaultValueForPrimitive(Class<?> p) {
        if (p == boolean.class) return false;
        if (p == byte.class) return (byte) 0;
        if (p == short.class) return (short) 0;
        if (p == char.class) return (char) 0;
        if (p == int.class) return 0;
        if (p == long.class) return 0L;
        if (p == float.class) return 0f;
        if (p == double.class) return 0d;
        throw new IllegalArgumentException("Unsupported primitive: " + p);
    }

    private static void setPrivate(Object target, String fieldName, Object value) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            if (Modifier.isStatic(f.getModifiers())) {
                f.set(null, value);
            } else {
                f.set(target, value);
            }
        } catch (Exception e) {
            fail("Could not set field '" + fieldName + "': " + e.getMessage());
        }
    }

    private static void setPrivateBoolean(Object target, String fieldName, boolean value) {
        try {
            Field f = target.getClass().getDeclaredField(fieldName);
            f.setAccessible(true);
            if (Modifier.isStatic(f.getModifiers())) {
                f.setBoolean(null, value);
            } else {
                f.setBoolean(target, value);
            }
        } catch (Exception e) {
            fail("Could not set boolean field '" + fieldName + "': " + e.getMessage());
        }
    }

    private static int getPrivateInt(Object targetOrClassInstance, String fieldName) {
        try {
            Class<?> clazz =
                    targetOrClassInstance instanceof Class
                            ? (Class<?>) targetOrClassInstance
                            : targetOrClassInstance.getClass();
            Field f = clazz.getDeclaredField(fieldName);
            f.setAccessible(true);
            if (Modifier.isStatic(f.getModifiers())) {
                return f.getInt(null);
            } else {
                return f.getInt(targetOrClassInstance);
            }
        } catch (Exception e) {
            fail("Could not read int field '" + fieldName + "': " + e.getMessage());
            return -1; // unreachable
        }
    }

    // --- Tests ---

    @Test
    @DisplayName("getRemainingAttempts(): returns Integer.MAX_VALUE when disabled or key blank")
    void getRemainingAttempts_shouldReturnMaxValueWhenDisabledOrBlankKey() throws Exception {
        Object svc = constructLoginAttemptService();

        // Ensure blocking disabled
        setPrivateBoolean(svc, "isBlockedEnabled", false);

        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        setPrivate(svc, "attemptsCache", attemptsCache);

        var method = svc.getClass().getMethod("getRemainingAttempts", String.class);

        // Case 1: disabled -> always MAX_VALUE regardless of key
        int disabledVal = (Integer) method.invoke(svc, "someUser");
        assertEquals(
                Integer.MAX_VALUE,
                disabledVal,
                "Disabled tracking should return Integer.MAX_VALUE");

        // Enable and verify blank/whitespace/null handling
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        int nullKeyVal = (Integer) method.invoke(svc, (Object) null);
        int blankKeyVal = (Integer) method.invoke(svc, "   ");

        assertEquals(
                Integer.MAX_VALUE,
                nullKeyVal,
                "Null key should return Integer.MAX_VALUE per current contract");
        assertEquals(
                Integer.MAX_VALUE,
                blankKeyVal,
                "Blank key should return Integer.MAX_VALUE per current contract");
    }

    @Test
    @DisplayName("getRemainingAttempts(): returns MAX_ATTEMPT when no counter exists for key")
    void getRemainingAttempts_shouldReturnMaxAttemptWhenNoEntry() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);
        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        setPrivate(svc, "attemptsCache", attemptsCache);

        int maxAttempt = getPrivateInt(svc, "MAX_ATTEMPT"); // Reads current policy value
        var method = svc.getClass().getMethod("getRemainingAttempts", String.class);

        int v1 = (Integer) method.invoke(svc, "UserA");
        int v2 =
                (Integer)
                        method.invoke(svc, "uSeRa"); // case-insensitive by service (normalization)

        assertEquals(maxAttempt, v1, "Unknown user should start with MAX_ATTEMPT remaining");
        assertEquals(
                maxAttempt,
                v2,
                "Case-insensitivity should not create separate entries if none exists yet");
    }

    @Test
    @DisplayName("getRemainingAttempts(): decreases with attemptCount in cache")
    void getRemainingAttempts_shouldDecreaseAfterAttemptCount() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        int maxAttempt = getPrivateInt(svc, "MAX_ATTEMPT");
        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        setPrivate(svc, "attemptsCache", attemptsCache);

        // Prepare a counter with attemptCount = 1
        AttemptCounter c1 = new AttemptCounter();
        Field ac = AttemptCounter.class.getDeclaredField("attemptCount");
        ac.setAccessible(true);
        ac.setInt(c1, 1);
        attemptsCache.put("userx".toLowerCase(Locale.ROOT), c1);

        var method = svc.getClass().getMethod("getRemainingAttempts", String.class);
        int actual = (Integer) method.invoke(svc, "USERX");

        assertEquals(
                maxAttempt - 1,
                actual,
                "Remaining attempts should reflect current attemptCount (case-insensitive lookup)");
    }

    @Test
    @DisplayName(
            "getRemainingAttempts(): can become negative when attemptCount > MAX_ATTEMPT (document"
                    + " current behavior)")
    void getRemainingAttempts_shouldBecomeNegativeWhenOverLimit_CurrentBehavior() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        int maxAttempt = getPrivateInt(svc, "MAX_ATTEMPT");
        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        setPrivate(svc, "attemptsCache", attemptsCache);

        // Create counter with attemptCount = MAX_ATTEMPT + 5
        AttemptCounter c = new AttemptCounter();
        Field ac = AttemptCounter.class.getDeclaredField("attemptCount");
        ac.setAccessible(true);
        ac.setInt(c, maxAttempt + 5);
        attemptsCache.put("over".toLowerCase(Locale.ROOT), c);

        var method = svc.getClass().getMethod("getRemainingAttempts", String.class);

        int actual = (Integer) method.invoke(svc, "OVER");
        int expected = maxAttempt - (maxAttempt + 5); // -5

        // Documentation test: current implementation returns a negative number.
        // If you later clamp to 0, update this assertion accordingly and add a new test.
        assertEquals(expected, actual, "Current behavior returns negative values without clamping");
    }

    @Test
    @DisplayName("resetAttempts(): removes entry from cache for given key")
    void resetAttempts_shouldRemoveEntryFromCache() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        AttemptCounter counter = new AttemptCounter();
        Field ac = AttemptCounter.class.getDeclaredField("attemptCount");
        ac.setAccessible(true);
        ac.setInt(counter, 5);
        attemptsCache.put("blockeduser", counter);
        setPrivate(svc, "attemptsCache", attemptsCache);

        var method = svc.getClass().getMethod("resetAttempts", String.class);
        method.invoke(svc, "BlockedUser"); // case-insensitive

        assertFalse(
                attemptsCache.containsKey("blockeduser"),
                "resetAttempts should remove the user's entry from the cache");
    }

    @Test
    @DisplayName("resetAttempts(): does nothing for null or blank key")
    void resetAttempts_shouldDoNothingForNullOrBlankKey() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        attemptsCache.put("existing", new AttemptCounter());
        setPrivate(svc, "attemptsCache", attemptsCache);

        var method = svc.getClass().getMethod("resetAttempts", String.class);
        method.invoke(svc, (Object) null);
        method.invoke(svc, "   ");

        assertEquals(1, attemptsCache.size(), "Null or blank key should not modify the cache");
    }

    @Test
    @DisplayName("isBlockingEnabled(): returns true when blocking is enabled")
    void isBlockingEnabled_shouldReturnTrueWhenEnabled() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);

        var method = svc.getClass().getMethod("isBlockingEnabled");
        boolean result = (Boolean) method.invoke(svc);

        assertTrue(result, "isBlockingEnabled should return true when isBlockedEnabled is true");
    }

    @Test
    @DisplayName("isBlockingEnabled(): returns false when blocking is disabled")
    void isBlockingEnabled_shouldReturnFalseWhenDisabled() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", false);

        var method = svc.getClass().getMethod("isBlockingEnabled");
        boolean result = (Boolean) method.invoke(svc);

        assertFalse(result, "isBlockingEnabled should return false when isBlockedEnabled is false");
    }

    @Test
    @DisplayName("getAllBlockedUsers(): returns empty list when blocking is disabled")
    void getAllBlockedUsers_shouldReturnEmptyWhenDisabled() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", false);
        setPrivate(svc, "attemptsCache", new ConcurrentHashMap<String, AttemptCounter>());

        var method = svc.getClass().getMethod("getAllBlockedUsers");
        @SuppressWarnings("unchecked")
        List<String> result = (List<String>) method.invoke(svc);

        assertTrue(
                result.isEmpty(),
                "getAllBlockedUsers should return empty list when blocking is disabled");
    }

    @Test
    @DisplayName("getAllBlockedUsers(): returns only users at or above MAX_ATTEMPT")
    void getAllBlockedUsers_shouldReturnOnlyBlockedUsers() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);
        setPrivate(svc, "MAX_ATTEMPT", 3);

        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        Field ac = AttemptCounter.class.getDeclaredField("attemptCount");
        ac.setAccessible(true);

        // User with exactly MAX_ATTEMPT attempts (blocked)
        AttemptCounter blocked1 = new AttemptCounter();
        ac.setInt(blocked1, 3);
        attemptsCache.put("blocked1", blocked1);

        // User with more than MAX_ATTEMPT attempts (blocked)
        AttemptCounter blocked2 = new AttemptCounter();
        ac.setInt(blocked2, 5);
        attemptsCache.put("blocked2", blocked2);

        // User with fewer than MAX_ATTEMPT attempts (not blocked)
        AttemptCounter notBlocked = new AttemptCounter();
        ac.setInt(notBlocked, 2);
        attemptsCache.put("safe", notBlocked);

        setPrivate(svc, "attemptsCache", attemptsCache);

        var method = svc.getClass().getMethod("getAllBlockedUsers");
        @SuppressWarnings("unchecked")
        List<String> result = (List<String>) method.invoke(svc);

        assertEquals(2, result.size(), "Should return exactly 2 blocked users");
        assertTrue(result.contains("blocked1"), "Should contain blocked1");
        assertTrue(result.contains("blocked2"), "Should contain blocked2");
        assertFalse(result.contains("safe"), "Should not contain safe user");
    }

    @Test
    @DisplayName("getAllBlockedUsers(): returns empty list when no users are blocked")
    void getAllBlockedUsers_shouldReturnEmptyWhenNoUsersBlocked() throws Exception {
        Object svc = constructLoginAttemptService();
        setPrivateBoolean(svc, "isBlockedEnabled", true);
        setPrivate(svc, "MAX_ATTEMPT", 3);

        var attemptsCache = new ConcurrentHashMap<String, AttemptCounter>();
        Field ac = AttemptCounter.class.getDeclaredField("attemptCount");
        ac.setAccessible(true);

        AttemptCounter notBlocked = new AttemptCounter();
        ac.setInt(notBlocked, 1);
        attemptsCache.put("user1", notBlocked);

        setPrivate(svc, "attemptsCache", attemptsCache);

        var method = svc.getClass().getMethod("getAllBlockedUsers");
        @SuppressWarnings("unchecked")
        List<String> result = (List<String>) method.invoke(svc);

        assertTrue(result.isEmpty(), "Should return empty list when no users exceed MAX_ATTEMPT");
    }
}
