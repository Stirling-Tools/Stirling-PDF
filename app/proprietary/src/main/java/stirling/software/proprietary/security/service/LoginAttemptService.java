package stirling.software.proprietary.security.service;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
     * Ceiling on tracked usernames. Entries expire on their own after the reset window, and this
     * bounds the set within it: the keys come straight from the login form, so without a cap a
     * spray of distinct usernames grows the map for as long as the window lasts.
     */
    private static final int MAX_TRACKED_USERS = 10_000;

    private int MAX_ATTEMPT;

    private long ATTEMPT_INCREMENT_TIME;

    private Cache<String, AttemptCounter> attemptsCache;

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
    }

    public void loginSucceeded(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        attemptsCache.invalidate(normalizedKey);
    }

    public void loginFailed(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        AttemptCounter attemptCounter = attemptsCache.getIfPresent(normalizedKey);
        if (attemptCounter == null) {
            attemptCounter = new AttemptCounter();
            attemptsCache.put(normalizedKey, attemptCounter);
        } else {
            if (attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                attemptCounter.reset();
            }
            attemptCounter.increment();
            // Mutating the counter does not refresh the cache write time, so re-insert: without
            // this the entry expires on the first failure's clock and lockout lapses early.
            attemptsCache.put(normalizedKey, attemptCounter);
        }
    }

    public boolean isBlocked(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return false;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
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
        attemptsCache.invalidate(normalizedKey);
    }

    public boolean isBlockingEnabled() {
        return isBlockedEnabled;
    }

    public List<String> getAllBlockedUsers() {
        if (!isBlockedEnabled) {
            return List.of();
        }
        return attemptsCache.asMap().entrySet().stream()
                .filter(entry -> entry.getValue().getAttemptCount() >= MAX_ATTEMPT)
                .map(Map.Entry::getKey)
                .toList();
    }

    public int getRemainingAttempts(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            // Arbitrarily high number if tracking is disabled
            return Integer.MAX_VALUE;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        AttemptCounter attemptCounter = attemptsCache.getIfPresent(normalizedKey);
        if (attemptCounter == null) {
            return MAX_ATTEMPT;
        }
        return MAX_ATTEMPT - attemptCounter.getAttemptCount();
    }
}
