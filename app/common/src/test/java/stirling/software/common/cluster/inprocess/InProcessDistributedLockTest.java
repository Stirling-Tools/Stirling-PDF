package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.DistributedLock;

class InProcessDistributedLockTest {

    @Test
    void acquireReleaseAcquire() {
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofSeconds(30)).orElseThrow();
        h1.release();
        assertTrue(lock.tryAcquire("k", Duration.ofSeconds(30)).isPresent());
    }

    @Test
    void reentryFromSameThreadFails() {
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofSeconds(30)).orElseThrow();
        Optional<DistributedLock.LockHandle> reentry = lock.tryAcquire("k", Duration.ofSeconds(30));
        assertFalse(reentry.isPresent(), "in-process lock must be non-reentrant");
        h1.release();
        // After release, anyone can acquire again.
        assertTrue(lock.tryAcquire("k", Duration.ofSeconds(30)).isPresent());
    }

    @Test
    void secondAcquireFromAnotherThreadFails() throws InterruptedException {
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofSeconds(30)).orElseThrow();

        CountDownLatch done = new CountDownLatch(1);
        AtomicBoolean acquired = new AtomicBoolean(true);
        Thread t =
                new Thread(
                        () -> {
                            Optional<DistributedLock.LockHandle> attempt =
                                    lock.tryAcquire("k", Duration.ofSeconds(30));
                            acquired.set(attempt.isPresent());
                            attempt.ifPresent(DistributedLock.LockHandle::release);
                            done.countDown();
                        });
        t.start();
        assertTrue(done.await(2, TimeUnit.SECONDS));
        assertFalse(acquired.get());
        h1.release();
    }
}
