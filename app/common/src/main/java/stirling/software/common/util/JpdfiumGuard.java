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

    private JpdfiumGuard() {}

    /** Acquires exclusive use of the native layer. Reentrant; always close in a finally block. */
    public static Scope acquire() {
        boolean nested = LOCK.isHeldByCurrentThread();
        long start = nested ? 0L : System.nanoTime();
        LOCK.lock();
        if (!nested) {
            long waitedMs = (System.nanoTime() - start) / 1_000_000L;
            if (waitedMs >= SLOW_WAIT_WARN_MS) {
                log.warn(
                        "Waited {} ms for exclusive jpdfium access ({} threads queued); native PDF"
                                + " work is serialised process-wide",
                        waitedMs,
                        LOCK.getQueueLength());
            }
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
