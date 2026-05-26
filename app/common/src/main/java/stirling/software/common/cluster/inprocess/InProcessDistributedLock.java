package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

import stirling.software.common.cluster.DistributedLock;

/**
 * In-process {@link DistributedLock}, non-reentrant per the interface contract.
 *
 * <p>Backed by a {@code Semaphore(1)} per key rather than {@code ReentrantLock}: a fresh semaphore
 * has exactly one permit, and {@link Semaphore#tryAcquire()} refuses the same thread that already
 * holds the permit. That matches the SET-NX-style semantics a distributed backend exposes - a
 * {@code ReentrantLock} would allow the holder to re-acquire and silently violate the contract.
 *
 * <p>Map entries are removed on release when nobody else is holding or queued on the semaphore,
 * which prevents unbounded growth for callers that mint a fresh lock key per job / file. Both
 * acquire and release run inside {@link ConcurrentHashMap#compute(Object,
 * java.util.function.BiFunction)} so the bin lock makes the check-and-remove safe against
 * concurrent acquires of the same key.
 */
public class InProcessDistributedLock implements DistributedLock {

    private final ConcurrentHashMap<String, Semaphore> locks = new ConcurrentHashMap<>();

    @Override
    public Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime) {
        Semaphore[] holder = new Semaphore[1];
        locks.compute(
                lockKey,
                (k, existing) -> {
                    Semaphore s = existing != null ? existing : new Semaphore(1);
                    if (s.tryAcquire()) {
                        holder[0] = s;
                    }
                    return s;
                });
        if (holder[0] == null) {
            return Optional.empty();
        }
        return Optional.of(new InProcessHandle(lockKey, holder[0]));
    }

    /**
     * Release the permit and drop the map entry when no thread is holding or waiting on the
     * semaphore. Runs inside {@code compute()} so a concurrent {@link #tryAcquire} for the same key
     * blocks on the bin lock and cannot observe a transient state where the entry has been removed
     * but a holder still exists.
     */
    private void releaseInternal(String lockKey, Semaphore sem) {
        locks.compute(
                lockKey,
                (k, existing) -> {
                    if (existing == null) {
                        // Already removed by a concurrent release path.
                        return null;
                    }
                    existing.release();
                    if (existing.availablePermits() >= 1 && !existing.hasQueuedThreads()) {
                        // Nobody owns it and nobody is parked waiting; a fresh acquire will
                        // recreate the semaphore atomically inside its own compute() call.
                        return null;
                    }
                    return existing;
                });
    }

    private final class InProcessHandle implements LockHandle {
        private final String lockKey;
        private final Semaphore sem;
        private boolean released;

        InProcessHandle(String lockKey, Semaphore sem) {
            this.lockKey = lockKey;
            this.sem = sem;
        }

        @Override
        public synchronized void release() {
            if (released) {
                return;
            }
            released = true;
            releaseInternal(lockKey, sem);
        }

        @Override
        public boolean renew(Duration leaseTime) {
            return !released;
        }
    }
}
