package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import stirling.software.common.cluster.DistributedLock;

/**
 * In-process {@link DistributedLock}, non-reentrant per the interface contract, with lease-expiry
 * semantics that mirror a SET-NX-EX style distributed backend.
 *
 * <p>Each lock state carries a per-acquire {@code ownerToken} and an {@code expiryNanos}; another
 * caller can take over once the lease has elapsed even if the original holder never called {@link
 * LockHandle#release()}. This matters mostly for parity with the Valkey-backed implementation
 * (Redis {@code SETEX} auto-expires the key); within a single JVM a crashed holder takes its lock
 * state with it, but tests and code that rely on the {@code leaseTime} parameter still need it to
 * be honored.
 *
 * <p>Expiry is lazy: an expired lock state lingers in the map until the next acquire attempt for
 * the same key replaces it. Per-key cleanup also happens on explicit {@link LockHandle#release()},
 * so a balanced acquire/release workload keeps the map size bounded.
 */
public class InProcessDistributedLock implements DistributedLock {

    private final ConcurrentHashMap<String, LockState> locks = new ConcurrentHashMap<>();
    private final AtomicLong tokenSeq = new AtomicLong();

    /**
     * Lease state for a single acquired lock. {@code ownerToken} prevents a former holder from
     * releasing or renewing a lock now owned by someone else after lease expiry; {@code
     * expiryNanos} is read/written only inside {@link ConcurrentHashMap#compute} so the bin lock
     * provides the necessary happens-before guarantee.
     */
    private static final class LockState {
        final long ownerToken;
        long expiryNanos;

        LockState(long ownerToken, long expiryNanos) {
            this.ownerToken = ownerToken;
            this.expiryNanos = expiryNanos;
        }
    }

    @Override
    public Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime) {
        long token = tokenSeq.incrementAndGet();
        long nowNanos = System.nanoTime();
        long expiryNanos = nowNanos + leaseTime.toNanos();
        boolean[] acquired = {false};
        locks.compute(
                lockKey,
                (k, existing) -> {
                    if (existing == null || existing.expiryNanos - nowNanos <= 0L) {
                        // No lock, or the previous lease has expired - we take it. Subtraction
                        // form avoids the long-overflow trap that would bite a naive
                        // expiryNanos <= nowNanos comparison around System.nanoTime() rollover.
                        acquired[0] = true;
                        return new LockState(token, expiryNanos);
                    }
                    return existing;
                });
        if (!acquired[0]) {
            return Optional.empty();
        }
        return Optional.of(new InProcessHandle(lockKey, token));
    }

    private void releaseInternal(String lockKey, long token) {
        locks.compute(
                lockKey,
                (k, existing) -> {
                    if (existing == null || existing.ownerToken != token) {
                        // Already removed, expired-and-replaced, or never ours.
                        return existing;
                    }
                    return null;
                });
    }

    private boolean renewInternal(String lockKey, long token, Duration leaseTime) {
        long nowNanos = System.nanoTime();
        boolean[] renewed = {false};
        locks.compute(
                lockKey,
                (k, existing) -> {
                    if (existing == null
                            || existing.ownerToken != token
                            || existing.expiryNanos - nowNanos <= 0L) {
                        // Lock is gone or expired; renewal is a no-op so the caller can detect it.
                        return existing;
                    }
                    existing.expiryNanos = nowNanos + leaseTime.toNanos();
                    renewed[0] = true;
                    return existing;
                });
        return renewed[0];
    }

    private final class InProcessHandle implements LockHandle {
        private final String lockKey;
        private final long token;
        private boolean released;

        InProcessHandle(String lockKey, long token) {
            this.lockKey = lockKey;
            this.token = token;
        }

        @Override
        public synchronized void release() {
            if (released) {
                return;
            }
            released = true;
            releaseInternal(lockKey, token);
        }

        @Override
        public synchronized boolean renew(Duration leaseTime) {
            if (released) {
                return false;
            }
            return renewInternal(lockKey, token, leaseTime);
        }
    }
}
