package stirling.software.common.util;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import lombok.extern.slf4j.Slf4j;

/**
 * Serialises all use of the jpdfium native layer, which is not thread-safe.
 *
 * <p>PDFium keeps process-global state and tolerates only one thread inside the library at a time.
 * Two overlapping documents corrupt that state permanently: every later {@code docOpen} throws
 * {@code PdfCorruptException} and {@code pageOpen} throws {@code Resource not found} for the rest
 * of the JVM's life, and the process can die inside pdfium.dll. Serialising open and close alone is
 * not enough, so a scope must span a whole document session.
 *
 * <p>Usage, with the guard listed first so it is released last:
 *
 * <pre>{@code
 * try (JpdfiumGuard.Scope guard = JpdfiumGuard.acquire();
 *         PdfDocument doc = PdfDocument.open(path)) {
 *     ...
 * }
 * }</pre>
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
     * Acquires exclusive use of the native layer, giving up after {@code timeout}.
     *
     * <p>For callers that must not block a response thread indefinitely. Returns empty when the
     * budget expires, leaving the caller to degrade rather than queue behind a long conversion.
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
