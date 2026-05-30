package stirling.software.proprietary.security.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

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

    private int MAX_ATTEMPT;

    private long ATTEMPT_INCREMENT_TIME;

    private ConcurrentHashMap<String, AttemptCounter> attemptsCache;

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
        attemptsCache = new ConcurrentHashMap<>();
    }

    public void loginSucceeded(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        attemptsCache.remove(normalizedKey);
    }

    public void loginFailed(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        AttemptCounter attemptCounter = attemptsCache.get(normalizedKey);
        if (attemptCounter == null) {
            attemptCounter = new AttemptCounter();
            attemptsCache.put(normalizedKey, attemptCounter);
        } else {
            if (attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                attemptCounter.reset();
            }
            attemptCounter.increment();
        }
    }

    public boolean isBlocked(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return false;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        AttemptCounter attemptCounter = attemptsCache.get(normalizedKey);
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
        attemptsCache.remove(normalizedKey);
    }

    public boolean isBlockingEnabled() {
        return isBlockedEnabled;
    }

    public List<String> getAllBlockedUsers() {
        if (!isBlockedEnabled) {
            return List.of();
        }
        return attemptsCache.entrySet().stream()
                .filter(entry -> entry.getValue().getAttemptCount() >= MAX_ATTEMPT)
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());
    }

    public int getRemainingAttempts(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            // Arbitrarily high number if tracking is disabled
            return Integer.MAX_VALUE;
        }
        String normalizedKey = key.toLowerCase(Locale.ROOT);
        AttemptCounter attemptCounter = attemptsCache.get(normalizedKey);
        if (attemptCounter == null) {
            return MAX_ATTEMPT;
        }
        return MAX_ATTEMPT - attemptCounter.getAttemptCount();
    }
}
