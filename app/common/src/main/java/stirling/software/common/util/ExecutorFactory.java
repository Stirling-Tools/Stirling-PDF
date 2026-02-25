package stirling.software.common.util;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

/**
 * Factory for creating executors backed by virtual threads (Java 21+). Virtual threads are
 * lightweight, managed by the JVM, and ideal for I/O-bound tasks. They eliminate the need for
 * thread pool sizing since thousands can run concurrently with minimal overhead.
 */
public final class ExecutorFactory {

    private ExecutorFactory() {}

    /** Creates an {@link ExecutorService} that starts a new virtual thread for each task. */
    public static ExecutorService newVirtualThreadExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    /**
     * Creates a {@link ScheduledExecutorService} backed by a single virtual thread. Useful for
     * periodic/delayed tasks that should not pin a platform thread.
     */
    public static ScheduledExecutorService newSingleVirtualThreadScheduledExecutor() {
        return Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("scheduled-vt-", 0).factory());
    }
}
