package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(15)
class OfficeConversionCancellationTest {

    @Test
    void timeoutKeepsResourcesOwnedUntilAnUninterruptibleWorkerFinishes() throws Exception {
        exerciseCancellation(false, Duration.ofMillis(20), 5200);
    }

    @Test
    void repeatedInterruptionCannotReleaseResourcesWhileTheWorkerIsRunning() throws Exception {
        exerciseCancellation(true, Duration.ofSeconds(30), 150);
    }

    private void exerciseCancellation(boolean interrupt, Duration timeout, long waitMillis)
            throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch cancelled = new CountDownLatch(1);
        CountDownLatch finish = new CountDownLatch(1);
        CountDownLatch returned = new CountDownLatch(1);
        AtomicBoolean workerFinished = new AtomicBoolean();
        AtomicBoolean releasedEarly = new AtomicBoolean();
        AtomicBoolean interruptRestored = new AtomicBoolean();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        FutureTask<Void> task =
                new FutureTask<>(
                        () -> {
                            started.countDown();
                            try {
                                boolean done = false;
                                while (!done) {
                                    try {
                                        done = finish.await(1, TimeUnit.SECONDS);
                                    } catch (InterruptedException ignored) {
                                        cancelled.countDown();
                                    }
                                }
                                return null;
                            } finally {
                                workerFinished.set(true);
                            }
                        });
        Thread worker = Thread.ofPlatform().daemon().unstarted(task);
        Thread caller =
                Thread.ofPlatform()
                        .daemon()
                        .unstarted(
                                () -> {
                                    try {
                                        OfficeConversionService.awaitPptConversion(
                                                task, worker, timeout);
                                    } catch (Throwable exception) {
                                        failure.set(exception);
                                    } finally {
                                        releasedEarly.set(!workerFinished.get());
                                        interruptRestored.set(
                                                Thread.currentThread().isInterrupted());
                                        returned.countDown();
                                    }
                                });
        worker.start();
        try {
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            caller.start();
            if (interrupt) caller.interrupt();
            assertThat(cancelled.await(2, TimeUnit.SECONDS)).isTrue();
            if (interrupt) caller.interrupt();
            assertThat(returned.await(waitMillis, TimeUnit.MILLISECONDS)).isFalse();
        } finally {
            finish.countDown();
            worker.join(2000);
            caller.join(2000);
        }
        assertThat(worker.isAlive()).isFalse();
        assertThat(caller.isAlive()).isFalse();
        assertThat(releasedEarly).isFalse();
        assertThat(failure.get())
                .isInstanceOf(IOException.class)
                .hasMessageContaining(interrupt ? "interrupted" : "took longer");
        if (interrupt) assertThat(interruptRestored).isTrue();
    }
}
