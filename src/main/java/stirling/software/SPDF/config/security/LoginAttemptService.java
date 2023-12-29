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

	
	@Autowired
	ApplicationProperties applicationProperties;
	
    private int MAX_ATTEMPTS;
    private long ATTEMPT_INCREMENT_TIME;
    
    
    @PostConstruct
    public void init() {
    	MAX_ATTEMPTS = applicationProperties.getSecurity().getLoginAttemptCount();
    	ATTEMPT_INCREMENT_TIME = TimeUnit.MINUTES.toMillis(applicationProperties.getSecurity().getLoginResetTimeMinutes());
    }
    
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
