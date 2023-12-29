package stirling.software.SPDF.model;
public class AttemptCounter {
    private int attemptCount;
    private long lastAttemptTime;

    public AttemptCounter() {
        this.attemptCount = 1;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public void increment() {
        this.attemptCount++;
        this.lastAttemptTime = System.currentTimeMillis();
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public long getlastAttemptTime() {
        return lastAttemptTime;
    }

    public boolean shouldReset(long ATTEMPT_INCREMENT_TIME) {
        return System.currentTimeMillis() - lastAttemptTime > ATTEMPT_INCREMENT_TIME;
    }
}
