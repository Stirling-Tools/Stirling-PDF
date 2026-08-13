package stirling.software.common.util;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Serialises the non-thread-safe jpdfium native layer: overlapping documents corrupt PDFium's
 * process-global state for the life of the JVM, so a scope must span a whole document session.
 */
@Slf4j
public final class JpdfiumGuard {

    private static final ReentrantLock LOCK = new ReentrantLock(true);

    private static final long SLOW_WAIT_WARN_MS =
            Long.getLong("stirling.jpdfium.slowWaitWarnMs", 10_000L);

    /** Longest a caller queues for the native layer before failing rather than hanging. */
    private static final Duration ACQUIRE_TIMEOUT =
            Duration.ofSeconds(Long.getLong("stirling.jpdfium.acquireTimeoutSeconds", 120L));

    private JpdfiumGuard() {}

    /** Acquires exclusive use of the native layer. Reentrant; always close in a finally block. */
    public static Scope acquire() {
        return acquire(ACQUIRE_TIMEOUT);
    }

    /** Bounded acquire; visible for testing so the wait budget can be shortened. */
    static Scope acquire(Duration budget) {
        if (LOCK.isHeldByCurrentThread()) {
            LOCK.lock();
            return new Scope();
        }
        long start = System.nanoTime();
        boolean held;
        try {
            held = LOCK.tryLock(budget.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new JpdfiumBusyException(
                    "Interrupted while waiting for exclusive jpdfium access", e);
        }
        if (!held) {
            // Never wait forever: one wedged conversion would otherwise hang every other caller.
            throw new JpdfiumBusyException(
                    "Timed out after "
                            + budget.toMillis()
                            + " ms waiting for exclusive jpdfium access ("
                            + LOCK.getQueueLength()
                            + " threads queued); native PDF work is serialised process-wide");
        }
        long waitedMs = (System.nanoTime() - start) / 1_000_000L;
        if (waitedMs >= SLOW_WAIT_WARN_MS) {
            log.warn(
                    "Waited {} ms for exclusive jpdfium access ({} threads queued); native PDF work"
                            + " is serialised process-wide",
                    waitedMs,
                    LOCK.getQueueLength());
        }
        return new Scope();
    }

    /**
     * Acquires exclusive use of the native layer, giving up after {@code timeout} so a response
     * thread can degrade instead of queueing behind a long conversion.
     */
    public static Optional<Scope> tryAcquire(Duration timeout) {
        try {
            if (LOCK.tryLock(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                return Optional.of(new Scope());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return Optional.empty();
    }

    /** True while the calling thread owns the native layer. */
    public static boolean heldByCurrentThread() {
        return LOCK.isHeldByCurrentThread();
    }

    /** Threads currently waiting to enter the native layer. */
    public static int queueLength() {
        return LOCK.getQueueLength();
    }

    /** Raised when the process-wide native lock could not be taken inside the wait budget. */
    public static final class JpdfiumBusyException extends RuntimeException {

        JpdfiumBusyException(String message) {
            super(message);
        }

        JpdfiumBusyException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Thread-confined release token; closing twice is a no-op. */
    public static final class Scope implements AutoCloseable {

        private boolean released;

        private Scope() {}

        @Override
        public void close() {
            if (!released) {
                released = true;
                LOCK.unlock();
            }
        }
    }
}
