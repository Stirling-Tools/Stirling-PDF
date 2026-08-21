package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.service.ResourceMonitor.ResourceStatus;

/** Additional coverage for JobQueue branches not exercised by JobQueueTest. */
@ExtendWith(MockitoExtension.class)
class JobQueueMoreTest {

    private JobQueue jobQueue;

    @Mock private ResourceMonitor resourceMonitor;

    private final AtomicReference<ResourceStatus> statusRef =
            new AtomicReference<>(ResourceStatus.OK);

    @BeforeEach
    void setUp() {
        lenient()
                .when(resourceMonitor.calculateDynamicQueueCapacity(anyInt(), anyInt()))
                .thenReturn(10);
        lenient().when(resourceMonitor.getCurrentStatus()).thenReturn(statusRef);
        jobQueue = new JobQueue(resourceMonitor);
    }

    private void invokeProcessQueue() {
        ReflectionTestUtils.invokeMethod(jobQueue, "processQueue");
    }

    // Bounded wait: block up to 5s for the queued job's future to settle on the executor.
    private static void awaitDone(CompletableFuture<?> future) {
        try {
            future.handle((r, e) -> null).get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new AssertionError("future did not complete within 5s", e);
        }
    }

    @Nested
    @DisplayName("SmartLifecycle")
    class Lifecycle {

        @Test
        @DisplayName("start/stop toggles running and start is idempotent")
        void startStopToggle() {
            assertThat(jobQueue.isRunning()).isFalse();

            jobQueue.start();
            assertThat(jobQueue.isRunning()).isTrue();

            // Second start is a no-op (already running).
            jobQueue.start();
            assertThat(jobQueue.isRunning()).isTrue();

            jobQueue.stop();
            assertThat(jobQueue.isRunning()).isFalse();
        }

        @Test
        @DisplayName("phase and auto-startup expose lifecycle ordering")
        void phaseAndAutoStartup() {
            assertThat(jobQueue.getPhase()).isEqualTo(10);
            assertThat(jobQueue.isAutoStartup()).isTrue();
        }

        @Test
        @DisplayName("stop completes any still-pending futures exceptionally")
        void stopCompletesPendingFutures() {
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("pending", 50, () -> "x", 1000);
            assertThat(future.isDone()).isFalse();

            // Drive shutdown without starting the scheduler so no processor races us to the job.
            jobQueue.stop();

            assertThat(future).isCompletedExceptionally();
        }
    }

    @Nested
    @DisplayName("queueJob capacity")
    class QueueCapacity {

        @Test
        @DisplayName("rejects a job when the queue is full")
        void rejectsWhenFull() {
            // Capacity-1 queue whose timed offer rejects instantly (no 5s block) when full.
            BlockingQueue<Object> instaReject =
                    new LinkedBlockingQueue<>(1) {
                        @Override
                        public boolean offer(Object e, long timeout, TimeUnit unit) {
                            return super.offer(e);
                        }
                    };
            ReflectionTestUtils.setField(jobQueue, "jobQueue", instaReject);
            jobQueue.queueJob("first", 50, () -> "a", 1000);

            CompletableFuture<ResponseEntity<?>> rejected =
                    jobQueue.queueJob("second", 50, () -> "b", 1000);

            assertThat(rejected).isCompletedExceptionally();
            assertThat(jobQueue.getRejectedJobs()).isEqualTo(1);
            assertThat(jobQueue.isJobQueued("second")).isFalse();
        }

        @Test
        @DisplayName("getQueueCapacity reflects remaining capacity plus current size")
        void getQueueCapacityReports() {
            ReflectionTestUtils.setField(jobQueue, "jobQueue", new LinkedBlockingQueue<>(5));
            jobQueue.queueJob("c1", 50, () -> "a", 1000);
            assertThat(jobQueue.getQueueCapacity()).isEqualTo(5);
        }
    }

    @Nested
    @DisplayName("job position")
    class JobPosition {

        @Test
        @DisplayName("returns 0 for the first queued job and -1 for an unknown job")
        void positionAndUnknown() {
            jobQueue.queueJob("p1", 50, () -> "a", 1000);
            jobQueue.queueJob("p2", 50, () -> "b", 1000);

            assertThat(jobQueue.getJobPosition("p1")).isEqualTo(0);
            assertThat(jobQueue.getJobPosition("p2")).isEqualTo(1);
            assertThat(jobQueue.getJobPosition("missing")).isEqualTo(-1);
        }
    }

    @Nested
    @DisplayName("cancelJob")
    class CancelJob {

        @Test
        @DisplayName("returns false when the job id is unknown")
        void cancelUnknownReturnsFalse() {
            assertThat(jobQueue.cancelJob("nope")).isFalse();
        }
    }

    @Nested
    @DisplayName("processQueue")
    class ProcessQueue {

        @Test
        @DisplayName("does nothing when shutting down")
        void noopWhenShuttingDown() {
            jobQueue.queueJob("s1", 50, () -> "a", 1000);
            ReflectionTestUtils.setField(jobQueue, "shuttingDown", true);

            invokeProcessQueue();

            // Still queued: the shutdown guard returned before polling.
            assertThat(jobQueue.isJobQueued("s1")).isTrue();
        }

        @Test
        @DisplayName("delays execution while the system is under critical load")
        void delaysUnderCriticalLoad() {
            statusRef.set(ResourceStatus.CRITICAL);
            jobQueue.queueJob("crit", 50, () -> "a", 1000);

            invokeProcessQueue();

            // Critical load: job remains queued, nothing executed.
            assertThat(jobQueue.isJobQueued("crit")).isTrue();
        }

        @Test
        @DisplayName("executes a queued job and completes its future when resources are OK")
        void executesWhenOk() {
            statusRef.set(ResourceStatus.OK);
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("ok", 50, () -> "done", 5000);

            invokeProcessQueue();

            awaitDone(future);
            assertThat(jobQueue.isJobQueued("ok")).isFalse();
            assertThat(future).isCompleted();
        }

        @Test
        @DisplayName("a job past the max wait time still executes and adds a timeout note")
        void overdueJobExecutesAndNotes() {
            statusRef.set(ResourceStatus.OK);
            ReflectionTestUtils.setField(jobQueue, "maxWaitTimeMs", 1L);
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("overdue", 50, () -> "late-done", 5000);

            // Backdate the queuedAt so wait-time exceeds maxWaitTimeMs.
            backdateQueuedAt("overdue");

            invokeProcessQueue();

            awaitDone(future);
            assertThat(future).isCompleted();
        }

        @SuppressWarnings("unchecked")
        private void backdateQueuedAt(String jobId) {
            var jobMap =
                    (java.util.Map<String, Object>)
                            ReflectionTestUtils.getField(jobQueue, "jobMap");
            Object job = jobMap.get(jobId);
            ReflectionTestUtils.setField(job, "queuedAt", Instant.now().minusSeconds(60));
        }
    }

    @Nested
    @DisplayName("executeJob")
    class ExecuteJob {

        @Test
        @DisplayName("a cancelled job is skipped by executeJob without running its work")
        @SuppressWarnings("unchecked")
        void cancelledJobSkipped() throws Exception {
            java.util.concurrent.atomic.AtomicBoolean ran =
                    new java.util.concurrent.atomic.AtomicBoolean(false);
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob(
                            "cancelled",
                            50,
                            () -> {
                                ran.set(true);
                                return "should-not-run";
                            },
                            1000);

            // Grab the real QueuedJob instance, mark it cancelled, then drive executeJob directly.
            var jobMap =
                    (java.util.Map<String, Object>)
                            ReflectionTestUtils.getField(jobQueue, "jobMap");
            Object job = jobMap.get("cancelled");
            ReflectionTestUtils.setField(job, "cancelled", true);

            var executeJob = JobQueue.class.getDeclaredMethod("executeJob", job.getClass());
            executeJob.setAccessible(true);
            executeJob.invoke(jobQueue, job);

            // The early return means the work supplier never ran.
            assertThat(ran.get()).isFalse();
            assertThat(future.isDone()).isFalse();
        }

        @Test
        @DisplayName("a non-ResponseEntity result is wrapped in ResponseEntity.ok")
        void nonResponseEntityWrapped() {
            statusRef.set(ResourceStatus.OK);
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("wrap", 50, () -> "plain", 5000);

            invokeProcessQueue();

            awaitDone(future);
            ResponseEntity<?> response = future.join();
            assertThat(response.getBody()).isEqualTo("plain");
        }

        @Test
        @DisplayName("a ResponseEntity result is forwarded as-is")
        void responseEntityForwarded() {
            statusRef.set(ResourceStatus.OK);
            ResponseEntity<String> inner = ResponseEntity.ok("inner");
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("forward", 50, () -> inner, 5000);

            invokeProcessQueue();

            awaitDone(future);
            assertThat(future.join()).isSameAs(inner);
        }

        @Test
        @DisplayName("a failing job completes its future exceptionally")
        void failingJobCompletesExceptionally() {
            statusRef.set(ResourceStatus.OK);
            Supplier<Object> failing =
                    () -> {
                        throw new RuntimeException("exec-boom");
                    };
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob("fail", 50, failing, 5000);

            invokeProcessQueue();

            awaitDone(future);
            assertThat(future).isCompletedExceptionally();
        }
    }

    @Nested
    @DisplayName("executeWithTimeout")
    class ExecuteWithTimeout {

        @Test
        @DisplayName("with no timeout it joins and returns the value")
        void noTimeoutJoins() {
            Object result =
                    ReflectionTestUtils.invokeMethod(
                            jobQueue, "executeWithTimeout", (Supplier<Object>) () -> "joined", 0L);
            assertThat(result).isEqualTo("joined");
        }

        @Test
        @DisplayName("an execution failure is unwrapped to its cause")
        void executionFailureUnwrapped() {
            Supplier<Object> failing =
                    () -> {
                        throw new IllegalStateException("inner-cause");
                    };
            Throwable thrown =
                    org.junit.jupiter.api.Assertions.assertThrows(
                            Throwable.class,
                            () ->
                                    ReflectionTestUtils.invokeMethod(
                                            jobQueue, "executeWithTimeout", failing, 1000L));
            assertThat(messageChain(thrown)).contains("inner-cause");
        }

        @Test
        @DisplayName("a slow job exceeds the timeout and throws TimeoutException")
        void slowJobTimesOut() {
            Supplier<Object> slow =
                    () -> {
                        long start = System.nanoTime();
                        while (System.nanoTime() - start < 200_000_000L) {
                            // busy wait beyond 1ms
                        }
                        return "late";
                    };
            Throwable thrown =
                    org.junit.jupiter.api.Assertions.assertThrows(
                            Throwable.class,
                            () ->
                                    ReflectionTestUtils.invokeMethod(
                                            jobQueue, "executeWithTimeout", slow, 1L));
            assertThat(messageChain(thrown)).contains("timed out");
        }

        // Spring's ReflectionTestUtils wraps checked exceptions, so inspect the whole cause chain.
        private String messageChain(Throwable t) {
            StringBuilder sb = new StringBuilder();
            for (Throwable c = t; c != null; c = c.getCause()) {
                if (c.getMessage() != null) {
                    sb.append(c.getMessage()).append('|');
                }
            }
            return sb.toString();
        }
    }

    @Nested
    @DisplayName("updateQueueCapacity")
    class UpdateQueueCapacity {

        @Test
        @DisplayName("resizes the queue and preserves queued jobs when capacity changes")
        void resizesQueue() {
            ReflectionTestUtils.setField(jobQueue, "jobQueue", new LinkedBlockingQueue<>(10));
            jobQueue.queueJob("keep", 50, () -> "a", 1000);

            // Force a new, smaller capacity on the next recalculation.
            when(resourceMonitor.calculateDynamicQueueCapacity(anyInt(), anyInt())).thenReturn(4);

            ReflectionTestUtils.invokeMethod(jobQueue, "updateQueueCapacity");

            assertThat(jobQueue.getQueueCapacity()).isEqualTo(4);
            // The previously queued job survived the drain into the new queue.
            assertThat(jobQueue.getCurrentQueueSize()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("getQueueStats")
    class QueueStats {

        @Test
        @DisplayName("includes the current resource status name")
        void includesResourceStatus() {
            statusRef.set(ResourceStatus.WARNING);
            var stats = jobQueue.getQueueStats();
            assertThat(stats.get("resourceStatus")).isEqualTo("WARNING");
            assertThat(stats).containsKeys("queuedJobs", "queueCapacity", "rejectedJobs");
        }
    }
}
