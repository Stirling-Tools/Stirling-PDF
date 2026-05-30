package stirling.software.common.cluster;

import java.time.Duration;
import java.util.Optional;

/** Cluster-wide mutual exclusion primitive; non-reentrant by contract. */
public interface DistributedLock {

    Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime);

    interface LockHandle extends AutoCloseable {
        void release();

        boolean renew(Duration leaseTime);

        @Override
        default void close() {
            release();
        }
    }
}
