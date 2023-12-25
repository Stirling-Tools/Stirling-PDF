package stirling.software.SPDF.config.security;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.AttemptCounter;

@Service
public class LoginAttemptService {

    private final int MAX_ATTEMPTS = 10;
    private final long ATTEMPT_INCREMENT_TIME = TimeUnit.MINUTES.toMillis(1);
    private final ConcurrentHashMap<String, AttemptCounter> attemptsCache = new ConcurrentHashMap<>();

    public void loginSucceeded(String key) {
        attemptsCache.remove(key);
    }

    public boolean loginAttemptCheck(String key) {
        attemptsCache.compute(key, (k, attemptCounter) -> {
            if (attemptCounter == null || attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                return new AttemptCounter();
            } else {
                attemptCounter.increment();
                return attemptCounter;
            }
        });
        return attemptsCache.get(key).getAttemptCount() >= MAX_ATTEMPTS;
    }


    public boolean isBlocked(String key) {
        AttemptCounter attemptCounter = attemptsCache.get(key);
        if (attemptCounter != null) {
            return attemptCounter.getAttemptCount() >= MAX_ATTEMPTS;
        }
        return false;
    }

}
