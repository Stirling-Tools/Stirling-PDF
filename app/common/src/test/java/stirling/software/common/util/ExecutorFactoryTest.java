package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ExecutorFactoryTest {

    @Test
    @DisplayName("newVirtualThreadExecutor should return non-null executor")
    void virtualThreadExecutorNotNull() {
        ExecutorService executor = ExecutorFactory.newVirtualThreadExecutor();
        assertNotNull(executor);
        executor.shutdown();
    }

    @Test
    @DisplayName("newVirtualThreadExecutor should execute tasks")
    void virtualThreadExecutorExecutesTasks() throws Exception {
        ExecutorService executor = ExecutorFactory.newVirtualThreadExecutor();
        AtomicBoolean ran = new AtomicBoolean(false);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(
                () -> {
                    ran.set(true);
                    latch.countDown();
                });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(ran.get());
        executor.shutdown();
    }

    @Test
    @DisplayName("newVirtualThreadExecutor should run on virtual threads")
    void virtualThreadExecutorUsesVirtualThreads() throws Exception {
        ExecutorService executor = ExecutorFactory.newVirtualThreadExecutor();
        AtomicReference<Boolean> isVirtual = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit(
                () -> {
                    isVirtual.set(Thread.currentThread().isVirtual());
                    latch.countDown();
                });

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(isVirtual.get());
        executor.shutdown();
    }

    @Test
    @DisplayName("newSingleVirtualThreadScheduledExecutor should return non-null")
    void scheduledExecutorNotNull() {
        ScheduledExecutorService executor =
                ExecutorFactory.newSingleVirtualThreadScheduledExecutor();
        assertNotNull(executor);
        executor.shutdown();
    }

    @Test
    @DisplayName("newSingleVirtualThreadScheduledExecutor should execute scheduled tasks")
    void scheduledExecutorExecutesTasks() throws Exception {
        ScheduledExecutorService executor =
                ExecutorFactory.newSingleVirtualThreadScheduledExecutor();
        AtomicBoolean ran = new AtomicBoolean(false);
        CountDownLatch latch = new CountDownLatch(1);

        executor.schedule(
                () -> {
                    ran.set(true);
                    latch.countDown();
                },
                10,
                TimeUnit.MILLISECONDS);

        assertTrue(latch.await(5, TimeUnit.SECONDS));
        assertTrue(ran.get());
        executor.shutdown();
    }
}
