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
    void reentryFromSameThreadFails_parityWithValkey() {
        // The Valkey impl refuses reentry (SET NX semantics); the in-process impl must match,
        // otherwise code working in single-instance silently breaks in cluster mode.
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

    @Test
    void leaseExpiryAllowsTakeoverEvenWithoutRelease() throws InterruptedException {
        // Acquire with a short lease, never call release, then try to acquire again after the
        // lease has elapsed. Matches Redis SET-NX-EX semantics - the second caller gets the lock
        // because the first lease auto-expired. 250ms lease + 350ms wait gives CI generous slack.
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofMillis(250)).orElseThrow();
        Thread.sleep(350);
        Optional<DistributedLock.LockHandle> takeover =
                lock.tryAcquire("k", Duration.ofSeconds(30));
        assertTrue(
                takeover.isPresent(),
                "expired lease must release the lock so a new caller can take over");
        // Calling release() on the original handle after takeover must be a no-op (token check).
        h1.release();
        // The takeover holder is still the legitimate owner.
        assertFalse(lock.tryAcquire("k", Duration.ofSeconds(30)).isPresent());
        takeover.get().release();
    }

    @Test
    void renewExtendsLease() throws InterruptedException {
        // Acquire with a short lease, renew it before it expires, then verify the lock is still
        // held past the original expiry point. 200ms initial + renew to 2s + wait 350ms.
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofMillis(200)).orElseThrow();
        assertTrue(h1.renew(Duration.ofSeconds(2)), "renew on a held lease must succeed");
        Thread.sleep(350);
        assertFalse(
                lock.tryAcquire("k", Duration.ofSeconds(30)).isPresent(),
                "renew should have pushed expiry well past the original 200ms");
        h1.release();
    }

    @Test
    void renewAfterReleaseFails() {
        DistributedLock lock = new InProcessDistributedLock();
        DistributedLock.LockHandle h1 = lock.tryAcquire("k", Duration.ofSeconds(30)).orElseThrow();
        h1.release();
        assertFalse(h1.renew(Duration.ofSeconds(30)), "renew on a released handle must fail");
    }

    /**
     * Concurrency stress: many threads contending on the same key with each holder respecting the
     * lease (hold &lt;&lt; lease). The lock behaves as a strict mutex in this regime so asserting
     * mutual exclusion is meaningful. A separate test ({@link
     * #leaseExpiryAllowsTakeoverEvenWithoutRelease}) covers the takeover-across-expiry branch,
     * which legitimately allows two holders momentarily and is split-brain behaviour inherent to
     * any lease-based lock.
     */
    @Test
    void concurrentContentionPreservesMutualExclusion() throws InterruptedException {
        DistributedLock lock = new InProcessDistributedLock();
        int threads = 16;
        int attemptsPerThread = 200;
        // Lease far exceeds any plausible hold time, so the takeover branch never triggers in
        // this test and the lock acts as a strict mutex.
        Duration lease = Duration.ofSeconds(5);
        java.util.concurrent.atomic.AtomicInteger concurrentHolders =
                new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger maxConcurrent =
                new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger acquires =
                new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<Throwable> firstFailure =
                new java.util.concurrent.atomic.AtomicReference<>();
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);

        for (int i = 0; i < threads; i++) {
            new Thread(
                            () -> {
                                try {
                                    start.await();
                                    for (int j = 0; j < attemptsPerThread; j++) {
                                        Optional<DistributedLock.LockHandle> h =
                                                lock.tryAcquire("hot", lease);
                                        if (h.isPresent()) {
                                            int now = concurrentHolders.incrementAndGet();
                                            maxConcurrent.accumulateAndGet(now, Math::max);
                                            acquires.incrementAndGet();
                                            // Trivial critical section; well within lease.
                                            concurrentHolders.decrementAndGet();
                                            h.get().release();
                                        }
                                    }
                                } catch (Throwable t) {
                                    firstFailure.compareAndSet(null, t);
                                } finally {
                                    done.countDown();
                                }
                            },
                            "lock-stress-" + i)
                    .start();
        }
        start.countDown();
        assertTrue(done.await(30, TimeUnit.SECONDS), "stress workers must finish in time");
        org.junit.jupiter.api.Assertions.assertNull(firstFailure.get(), "no worker may throw");
        org.junit.jupiter.api.Assertions.assertEquals(
                1,
                maxConcurrent.get(),
                "mutual exclusion violated: more than one holder observed simultaneously");
        assertTrue(
                acquires.get() > 0,
                "at least some acquires must succeed under contention (saw "
                        + acquires.get()
                        + ")");
    }
}
