package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import stirling.software.common.cluster.DistributedLock;

/** In-process {@link DistributedLock}; non-reentrant per the interface contract. */
public class InProcessDistributedLock implements DistributedLock {

    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    @Override
    public Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime) {
        ReentrantLock lock = locks.computeIfAbsent(lockKey, k -> new ReentrantLock());
        // Refuse reentry so behaviour matches a distributed SET NX backend.
        if (lock.isLocked()) {
            return Optional.empty();
        }
        if (lock.tryLock()) {
            return Optional.of(new InProcessHandle(lock));
        }
        return Optional.empty();
    }

    private static final class InProcessHandle implements LockHandle {
        private final ReentrantLock lock;
        private boolean released;

        InProcessHandle(ReentrantLock lock) {
            this.lock = lock;
        }

        @Override
        public synchronized void release() {
            if (released) {
                return;
            }
            released = true;
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }

        @Override
        public boolean renew(Duration leaseTime) {
            return !released;
        }
    }
}
