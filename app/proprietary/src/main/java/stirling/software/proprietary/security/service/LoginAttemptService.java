package stirling.software.proprietary.security.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.AttemptCounter;

@Service
@Slf4j
@RequiredArgsConstructor
public class LoginAttemptService {

    private final ApplicationProperties applicationProperties;

    /**
     * Ceiling on tracked usernames: keys come straight from the login form, so without a cap a
     * spray of distinct usernames grows the map for the whole reset window.
     */
    private static final int MAX_TRACKED_USERS = 10_000;

    private static final int MAX_BLOCKED_USERS = 100_000;

    /**
     * Stripes serializing updates and resets for the same username. A failed login
     * read-modify-writes its counter, so without this a failure racing a successful login can
     * reinsert the cleared counter and relock the account. Reads stay lock-free; a stale read only
     * delays a lockout decision by one request.
     */
    private static final int KEY_LOCK_STRIPES = 64;

    private final Object[] keyLocks = new Object[KEY_LOCK_STRIPES];

    {
        for (int i = 0; i < keyLocks.length; i++) {
            keyLocks[i] = new Object();
        }
    }

    private int MAX_ATTEMPT;

    private long ATTEMPT_INCREMENT_TIME;

    private Cache<String, AttemptCounter> attemptsCache;

    /**
     * Lockout record that survives eviction of the counting cache: a username spray can drop a
     * victim's counter, so the lockout lives here too, where clearing it costs {@code MAX_ATTEMPT}
     * failures per sprayed username. Sized 10x the counting cache, so overflowing it takes an order
     * of magnitude more request volume; values are one Boolean each.
     *
     * <p>Built without expiry so the field is never null; {@link #init()} rebuilds it with the
     * configured window.
     */
    private Cache<String, Boolean> blockedCache =
            Caffeine.newBuilder().maximumSize(MAX_BLOCKED_USERS).build();

    private boolean isBlockedEnabled = true;

    @PostConstruct
    public void init() {
        MAX_ATTEMPT = applicationProperties.getSecurity().getLoginAttemptCount();
        if (MAX_ATTEMPT == -1) {
            isBlockedEnabled = false;
            log.info("Login attempt tracking is disabled.");
        }
        ATTEMPT_INCREMENT_TIME =
                TimeUnit.MINUTES.toMillis(
                        applicationProperties.getSecurity().getLoginResetTimeMinutes());
        if (isBlockedEnabled && ATTEMPT_INCREMENT_TIME <= 0) {
            throw new IllegalStateException(
                    "Login attempt tracking is enabled but loginResetTimeMinutes is not positive;"
                            + " a zero window would expire every entry on write and disable lockout.");
        }
        attemptsCache =
                Caffeine.newBuilder()
                        .maximumSize(MAX_TRACKED_USERS)
                        .expireAfterWrite(Duration.ofMillis(ATTEMPT_INCREMENT_TIME))
                        .build();
        blockedCache =
                Caffeine.newBuilder()
                        .maximumSize(MAX_BLOCKED_USERS)
                        .expireAfterWrite(Duration.ofMillis(ATTEMPT_INCREMENT_TIME))
                        .build();
    }

    private Object lockFor(String normalizedKey) {
        return keyLocks[(normalizedKey.hashCode() & 0x7fffffff) % keyLocks.length];
    }

    public void loginSucceeded(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        synchronized (lockFor(normalizedKey)) {
            attemptsCache.invalidate(normalizedKey);
            blockedCache.invalidate(normalizedKey);
        }
    }

    public void loginFailed(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        synchronized (lockFor(normalizedKey)) {
            AttemptCounter attemptCounter = attemptsCache.getIfPresent(normalizedKey);
            if (attemptCounter == null) {
                attemptCounter = new AttemptCounter();
                attemptsCache.put(normalizedKey, attemptCounter);
            } else {
                if (attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                    attemptCounter.reset();
                    blockedCache.invalidate(normalizedKey);
                }
                attemptCounter.increment();
                // Mutating the counter does not refresh the cache write time, so re-insert:
                // without this the entry expires on the first failure's clock and lockout lapses
                // early.
                attemptsCache.put(normalizedKey, attemptCounter);
            }
            if (attemptCounter.getAttemptCount() >= MAX_ATTEMPT
                    || blockedCache.getIfPresent(normalizedKey) != null) {
                // Refresh the lockout on every further failure: the counting entry can be
                // evicted and recreated by a spray, which must neither lift the lockout nor let
                // it lapse on its old clock.
                blockedCache.put(normalizedKey, Boolean.TRUE);
            }
        }
    }

    public boolean isBlocked(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return false;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        if (blockedCache.getIfPresent(normalizedKey) != null) {
            return true;
        }
        AttemptCounter attemptCounter = attemptsCache.getIfPresent(normalizedKey);
        if (attemptCounter == null) {
            return false;
        }
        return attemptCounter.getAttemptCount() >= MAX_ATTEMPT;
    }

    public void resetAttempts(String key) {
        if (key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        synchronized (lockFor(normalizedKey)) {
            attemptsCache.invalidate(normalizedKey);
            blockedCache.invalidate(normalizedKey);
        }
    }

    public boolean isBlockingEnabled() {
        return isBlockedEnabled;
    }

    public List<String> getAllBlockedUsers() {
        if (!isBlockedEnabled) {
            return List.of();
        }
        Set<String> blocked = new LinkedHashSet<>(blockedCache.asMap().keySet());
        attemptsCache.asMap().entrySet().stream()
                .filter(entry -> entry.getValue().getAttemptCount() >= MAX_ATTEMPT)
                .map(Map.Entry::getKey)
                .forEach(blocked::add);
        return new ArrayList<>(blocked);
    }

    public int getRemainingAttempts(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            // Arbitrarily high number if tracking is disabled
            return Integer.MAX_VALUE;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        if (blockedCache.getIfPresent(normalizedKey) != null) {
            return 0;
        }
        AttemptCounter attemptCounter = attemptsCache.getIfPresent(normalizedKey);
        if (attemptCounter == null) {
            return MAX_ATTEMPT;
        }
        return MAX_ATTEMPT - attemptCounter.getAttemptCount();
    }
}
