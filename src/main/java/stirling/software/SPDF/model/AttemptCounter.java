package stirling.software.SPDF.model;
public class AttemptCounter {
    private int attemptCount;
    private long firstAttemptTime;

    public AttemptCounter() {
        this.attemptCount = 1;
        this.firstAttemptTime = System.currentTimeMillis();
    }

    public void increment() {
        this.attemptCount++;
        this.firstAttemptTime = System.currentTimeMillis();
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public long getFirstAttemptTime() {
        return firstAttemptTime;
    }

    public boolean shouldReset(long ATTEMPT_INCREMENT_TIME) {
        return System.currentTimeMillis() - firstAttemptTime > ATTEMPT_INCREMENT_TIME;
    }
}
