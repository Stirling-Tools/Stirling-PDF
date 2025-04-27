package stirling.software.SPDF.config.security;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.AttemptCounter;

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
        attemptsCache.remove(key.toLowerCase());
    }

    public void loginFailed(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            return;
        }
        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter == null) {
            attemptCounter = new AttemptCounter();
            attemptsCache.put(key.toLowerCase(), attemptCounter);
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
        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter == null) {
            return false;
        }
        return attemptCounter.getAttemptCount() >= MAX_ATTEMPT;
    }

    public int getRemainingAttempts(String key) {
        if (!isBlockedEnabled || key == null || key.trim().isEmpty()) {
            // Arbitrarily high number if tracking is disabled
            return Integer.MAX_VALUE;
        }
        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter == null) {
            return MAX_ATTEMPT;
        }
        return MAX_ATTEMPT - attemptCounter.getAttemptCount();
    }
}
