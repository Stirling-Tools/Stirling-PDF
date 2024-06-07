package stirling.software.SPDF.config.security;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.AttemptCounter;

@Service
public class LoginAttemptService {

    @Autowired ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(LoginAttemptService.class);

    private int MAX_ATTEMPT;
    private long ATTEMPT_INCREMENT_TIME;
    private ConcurrentHashMap<String, AttemptCounter> attemptsCache;

    @PostConstruct
    public void init() {
        MAX_ATTEMPT = applicationProperties.getSecurity().getLoginAttemptCount();
        ATTEMPT_INCREMENT_TIME =
                TimeUnit.MINUTES.toMillis(
                        applicationProperties.getSecurity().getLoginResetTimeMinutes());
        attemptsCache = new ConcurrentHashMap<>();
    }

    public void loginSucceeded(String key) {
        if (key == null || key.trim().isEmpty()) {
            return;
        }
        attemptsCache.remove(key.toLowerCase());
    }

    public void loginFailed(String key) {
        if (key == null || key.trim().isEmpty()) return;

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
        if (key == null || key.trim().isEmpty()) return false;
        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter == null) {
            return false;
        }

        return attemptCounter.getAttemptCount() >= MAX_ATTEMPT;
    }

    public int getRemainingAttempts(String key) {
        if (key == null || key.trim().isEmpty()) return MAX_ATTEMPT;

        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter == null) {
            return MAX_ATTEMPT;
        }

        return MAX_ATTEMPT - attemptCounter.getAttemptCount();
    }
}
