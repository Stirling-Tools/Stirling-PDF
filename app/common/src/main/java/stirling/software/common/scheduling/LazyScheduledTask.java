package stirling.software.common.scheduling;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronTrigger;

import lombok.extern.slf4j.Slf4j;

/**
 * Submits a recurring task to the application {@link TaskScheduler} on the first {@code ensure*}
 * call and never again, letting a feature start its periodic work from the moment it is first used
 * instead of an always-on {@code @Scheduled} registration at startup.
 *
 * <p>Thread-safe: schedule parameters belong to the first successful call, later calls only flip
 * the once-gate. A failed registration is logged and the gate reopens so a later call retries.
 */
@Slf4j
public final class LazyScheduledTask {

    private final TaskScheduler scheduler;
    private final Runnable task;
    private final AtomicBoolean scheduled = new AtomicBoolean();

    public LazyScheduledTask(TaskScheduler scheduler, Runnable task) {
        this.scheduler = scheduler;
        this.task = task;
    }

    /** Runs immediately, then again {@code delay} after each run completes. */
    public void ensureFixedDelay(Duration delay) {
        submit(() -> scheduler.scheduleWithFixedDelay(task, Instant.now(), delay));
    }

    /** Runs {@code initialDelay} from now, then again {@code delay} after each run completes. */
    public void ensureFixedDelay(Duration initialDelay, Duration delay) {
        submit(
                () ->
                        scheduler.scheduleWithFixedDelay(
                                task, Instant.now().plus(initialDelay), delay));
    }

    /** Runs immediately, then every {@code rate}. */
    public void ensureFixedRate(Duration rate) {
        submit(() -> scheduler.scheduleAtFixedRate(task, Instant.now(), rate));
    }

    /** Runs {@code initialDelay} from now, then every {@code rate}. */
    public void ensureFixedRate(Duration initialDelay, Duration rate) {
        submit(() -> scheduler.scheduleAtFixedRate(task, Instant.now().plus(initialDelay), rate));
    }

    /** Runs on the given cron schedule. */
    public void ensureCron(String cronExpression) {
        submit(() -> scheduler.schedule(task, new CronTrigger(cronExpression)));
    }

    private void submit(Runnable register) {
        if (scheduled.compareAndSet(false, true)) {
            try {
                register.run();
            } catch (RuntimeException e) {
                scheduled.set(false);
                log.warn("Failed to register scheduled task; a later call will retry", e);
            }
        }
    }
}
