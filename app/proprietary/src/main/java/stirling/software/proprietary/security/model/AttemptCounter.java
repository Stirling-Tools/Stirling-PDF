package stirling.software.proprietary.security.model;

import lombok.Getter;

@Getter
public class AttemptCounter {
    private int attemptCount;
    private long lastAttemptTime;

    public AttemptCounter() {
        this.attemptCount = 0;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public void increment() {
        this.attemptCount++;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public boolean shouldReset(long attemptIncrementTime) {
        return System.currentTimeMillis() - lastAttemptTime > attemptIncrementTime;
    }

    public void reset() {
        this.attemptCount = 0;
        this.lastAttemptTime = System.currentTimeMillis();
    }
}
