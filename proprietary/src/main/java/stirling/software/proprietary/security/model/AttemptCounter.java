<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/model/AttemptCounter.java
package stirling.software.proprietary.security.model;
========
package stirling.software.enterprise.security.model;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/model/AttemptCounter.java

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
