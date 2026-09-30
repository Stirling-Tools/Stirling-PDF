package stirling.software.common.util;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;

/** Creates background executors and cancellation schedulers with independent execution capacity. */
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

    /**
     * Cancellation deadlines use a platform thread so CPU-bound virtual workers cannot prevent
     * their own interruption. Cancelled deadlines release the captured work immediately.
     */
    public static ScheduledExecutorService newTimeoutScheduler(String name) {
        ScheduledThreadPoolExecutor executor =
                new ScheduledThreadPoolExecutor(
                        1, Thread.ofPlatform().daemon().name(name).factory());
        executor.setRemoveOnCancelPolicy(true);
        return executor;
    }
}
