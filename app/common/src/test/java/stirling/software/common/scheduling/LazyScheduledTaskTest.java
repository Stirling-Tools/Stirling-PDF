package stirling.software.common.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;
import org.springframework.scheduling.support.CronTrigger;

class LazyScheduledTaskTest {

    private final TaskScheduler scheduler = mock(TaskScheduler.class);

    @Test
    @DisplayName("fixed delay registers once; later calls never reschedule")
    void fixedDelayRegistersOnce() {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureFixedDelay(Duration.ofMinutes(30));
        lazy.ensureFixedDelay(Duration.ofMinutes(30));
        lazy.ensureFixedDelay(Duration.ofMinutes(5));

        verify(scheduler)
                .scheduleWithFixedDelay(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofMinutes(30)));
    }

    @Test
    @DisplayName("fixed delay with initial delay keeps the first call's parameters")
    void fixedDelayWithInitialDelay() {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureFixedDelay(Duration.ofDays(1), Duration.ofDays(1));

        ArgumentCaptor<Instant> firstRun = ArgumentCaptor.forClass(Instant.class);
        verify(scheduler)
                .scheduleWithFixedDelay(
                        any(Runnable.class), firstRun.capture(), eq(Duration.ofDays(1)));
        assertThat(firstRun.getValue())
                .isAfter(Instant.now().plus(Duration.ofHours(23)))
                .isBefore(Instant.now().plus(Duration.ofDays(1).plusMinutes(1)));
    }

    @Test
    @DisplayName("fixed rate registers once with the given period")
    void fixedRateRegistersOnce() {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureFixedRate(Duration.ofHours(2));
        lazy.ensureFixedRate(Duration.ofHours(2));

        verify(scheduler, times(1))
                .scheduleAtFixedRate(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofHours(2)));
    }

    @Test
    @DisplayName("fixed rate with initial delay sets a first run in the future")
    void fixedRateWithInitialDelay() {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureFixedRate(Duration.ofDays(7), Duration.ofDays(7));

        ArgumentCaptor<Instant> firstRun = ArgumentCaptor.forClass(Instant.class);
        verify(scheduler)
                .scheduleAtFixedRate(
                        any(Runnable.class), firstRun.capture(), eq(Duration.ofDays(7)));
        assertThat(firstRun.getValue()).isAfter(Instant.now().plus(Duration.ofDays(6)));
    }

    @Test
    @DisplayName("cron uses the first expression and registers once")
    void cronRegistersOnce() {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureCron("0 0/5 * * * ?");
        lazy.ensureCron("0 0 0 * * MON");

        ArgumentCaptor<Trigger> trigger = ArgumentCaptor.forClass(Trigger.class);
        verify(scheduler).schedule(any(Runnable.class), trigger.capture());
        assertThat(trigger.getValue()).isInstanceOf(CronTrigger.class);
        assertThat(((CronTrigger) trigger.getValue()).getExpression()).isEqualTo("0 0/5 * * * ?");
    }

    @Test
    @DisplayName("concurrent ensures register exactly once")
    void concurrentEnsuresRegisterOnce() throws Exception {
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});
        try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
            CountDownLatch start = new CountDownLatch(1);
            Future<?>[] futures = new Future<?>[16];
            for (int i = 0; i < futures.length; i++) {
                futures[i] =
                        pool.submit(
                                () -> {
                                    start.await();
                                    lazy.ensureFixedRate(Duration.ofMinutes(1));
                                    return null;
                                });
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get();
            }
        }

        verify(scheduler, times(1))
                .scheduleAtFixedRate(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofMinutes(1)));
    }

    @Test
    @DisplayName("a failed registration reopens the gate so a later call retries")
    void failedRegistrationRetries() {
        doThrow(new IllegalStateException("scheduler down"))
                .when(scheduler)
                .scheduleWithFixedDelay(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofMinutes(1)));
        LazyScheduledTask lazy = new LazyScheduledTask(scheduler, () -> {});

        lazy.ensureFixedDelay(Duration.ofMinutes(1));
        lazy.ensureFixedDelay(Duration.ofMinutes(1));

        verify(scheduler, times(2))
                .scheduleWithFixedDelay(
                        any(Runnable.class), any(Instant.class), eq(Duration.ofMinutes(1)));
    }
}
