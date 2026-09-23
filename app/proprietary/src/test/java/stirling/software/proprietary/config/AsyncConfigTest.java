package stirling.software.proprietary.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AsyncConfigTest {

    @Test
    @DisplayName("a burst of audit writes never runs more than the cap at once")
    void burstIsCapped() throws InterruptedException {
        ThreadPoolExecutor executor = AsyncConfig.boundedExecutor(4, 1000);
        AtomicInteger running = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        CountDownLatch done = new CountDownLatch(200);
        try {
            for (int i = 0; i < 200; i++) {
                executor.execute(
                        () -> {
                            peak.accumulateAndGet(running.incrementAndGet(), Math::max);
                            try {
                                Thread.sleep(2);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            } finally {
                                running.decrementAndGet();
                                done.countDown();
                            }
                        });
            }
            assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
            assertThat(peak.get()).isBetween(1, 4);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("overflow is dropped and counted without failing the submitting request")
    void overflowIsDroppedNotThrown() throws InterruptedException {
        ThreadPoolExecutor executor = AsyncConfig.boundedExecutor(1, 1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        try {
            executor.execute(
                    () -> {
                        started.countDown();
                        try {
                            release.await();
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    });
            assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();
            executor.execute(() -> {});

            assertThatCode(() -> executor.execute(() -> {})).doesNotThrowAnyException();
            assertThat(
                            ((AsyncConfig.DropAndCount) executor.getRejectedExecutionHandler())
                                    .dropped())
                    .isEqualTo(1);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }
}
