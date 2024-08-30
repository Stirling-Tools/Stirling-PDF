package stirling.software.SPDF.model;

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

    public int getAttemptCount() {
        return attemptCount;
    }

    public long getLastAttemptTime() {
        return lastAttemptTime;
    }

    public boolean shouldReset(long attemptIncrementTime) {
        return System.currentTimeMillis() - lastAttemptTime > attemptIncrementTime;
    }

    public void reset() {
        this.attemptCount = 0;
        this.lastAttemptTime = System.currentTimeMillis();
    }
}
