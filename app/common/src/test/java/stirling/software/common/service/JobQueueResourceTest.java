package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

class JobQueueResourceTest {
    private ResourceMonitor monitor;
    private JobQueue queue;

    @BeforeEach
    void setUp() {
        monitor = mock(ResourceMonitor.class);
        when(monitor.calculateDynamicQueueCapacity(anyInt(), anyInt())).thenReturn(10);
        when(monitor.getCurrentStatus())
                .thenReturn(new AtomicReference<>(ResourceMonitor.ResourceStatus.OK));
        queue = new JobQueue(monitor);
    }

    @AfterEach
    void tearDown() {
        queue.stop();
    }

    @Test
    void shrinkingBelowOccupancyDoesNotLoseAcceptedJobs() throws Exception {
        var results = new ArrayList<CompletableFuture<ResponseEntity<?>>>();
        for (int i = 0; i < 5; i++) {
            int value = i;
            results.add(queue.queueJob("job-" + i, 1, () -> value, 1000));
        }
        when(monitor.calculateDynamicQueueCapacity(anyInt(), anyInt())).thenReturn(2);
        ReflectionTestUtils.invokeMethod(queue, "updateQueueCapacity");
        for (int i = 0; i < 5; i++) {
            assertThat(queue.getJobPosition("job-" + i)).isEqualTo(i);
        }
        ReflectionTestUtils.invokeMethod(queue, "processQueue");
        ReflectionTestUtils.invokeMethod(queue, "processQueue");
        for (int i = 0; i < results.size(); i++) {
            assertThat(results.get(i).get(2, TimeUnit.SECONDS).getBody()).isEqualTo(i);
        }
        ReflectionTestUtils.invokeMethod(queue, "updateQueueCapacity");
        assertThat(queue.getQueueCapacity()).isEqualTo(2);
    }

    @Test
    void timeoutInterruptsTheActualSupplier() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch interrupted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            var result =
                    queue.queueJob(
                            "slow",
                            1,
                            () -> {
                                started.countDown();
                                try {
                                    release.await();
                                } catch (InterruptedException e) {
                                    interrupted.countDown();
                                    Thread.currentThread().interrupt();
                                }
                                return "done";
                            },
                            100);
            ReflectionTestUtils.invokeMethod(queue, "processQueue");
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            result.handle((r, e) -> null).get(2, TimeUnit.SECONDS);
            assertThat(result).isCompletedExceptionally();
            assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
        } finally {
            release.countDown();
        }
    }

    @Test
    void shutdownReleasesQueuedWorkAndRejectsNewWork() {
        var queued = queue.queueJob("waiting", 1, () -> "unused", 1000);
        queue.stop();
        assertThat(queued).isCompletedExceptionally();
        assertThat(queue.isJobQueued("waiting")).isFalse();
        var rejected = queue.queueJob("late", 1, () -> "unused", 1000);
        assertThat(rejected).isCompletedExceptionally();
        assertThat(queue.isJobQueued("late")).isFalse();
    }
}
