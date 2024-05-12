package stirling.software.SPDF.config.security;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.AttemptCounter;

@Service
public class LoginAttemptService {

    @Autowired ApplicationProperties applicationProperties;

    private int MAX_ATTEMPTS;
    private long ATTEMPT_INCREMENT_TIME;

    @PostConstruct
    public void init() {
        MAX_ATTEMPTS = applicationProperties.getSecurity().getLoginAttemptCount();
        ATTEMPT_INCREMENT_TIME =
                TimeUnit.MINUTES.toMillis(
                        applicationProperties.getSecurity().getLoginResetTimeMinutes());
    }

    private final ConcurrentHashMap<String, AttemptCounter> attemptsCache =
            new ConcurrentHashMap<>();

    public void loginSucceeded(String key) {
        attemptsCache.remove(key.toLowerCase());
    }

    public boolean loginAttemptCheck(String key) {
        return attemptsCache
                        .compute(
                                key.toLowerCase(),
                                (k, attemptCounter) -> {
                                    if (attemptCounter == null
                                            || attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                                        return new AttemptCounter();
                                    } else {
                                        attemptCounter.increment();
                                        return attemptCounter;
                                    }
                                })
                        .getAttemptCount()
                >= MAX_ATTEMPTS;
    }

    public boolean isBlocked(String key) {
        AttemptCounter attemptCounter = attemptsCache.get(key.toLowerCase());
        if (attemptCounter != null) {
            return attemptCounter.getAttemptCount() >= MAX_ATTEMPTS
                    && !attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME);
        }
        return false;
    }
}
