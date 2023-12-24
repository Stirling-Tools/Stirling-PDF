package stirling.software.SPDF.config.security;
import org.springframework.stereotype.Service;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import stirling.software.SPDF.model.AttemptCounter;

@Service
public class LoginAttemptService {

    private final int MAX_ATTEMPTS = 2;
    private final long ATTEMPT_INCREMENT_TIME = TimeUnit.MINUTES.toMillis(1);
    private final ConcurrentHashMap<String, AttemptCounter> attemptsCache = new ConcurrentHashMap<>();

    public void loginSucceeded(String key) {
    	System.out.println("here3 reset ");
        attemptsCache.remove(key);
    }

    public boolean loginAttemptCheck(String key) {
        System.out.println("here");
        attemptsCache.compute(key, (k, attemptCounter) -> {
            if (attemptCounter == null || attemptCounter.shouldReset(ATTEMPT_INCREMENT_TIME)) {
                return new AttemptCounter();
            } else {
                attemptCounter.increment();
                return attemptCounter;
            }
        });
        System.out.println("here2 = " + attemptsCache.get(key).getAttemptCount());
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
