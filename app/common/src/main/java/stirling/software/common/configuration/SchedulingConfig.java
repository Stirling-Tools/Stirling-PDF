package stirling.software.common.configuration;

/**
 * Configures the scheduler used by all {@code @Scheduled} methods. Uses virtual threads so that
 * long-running scheduled tasks (e.g. cleanup, license checks, file monitoring) never block each
 * other — each runs on its own lightweight virtual thread.
 *
 * <p>MIGRATION (Spring -> Quarkus): the custom Spring {@code TaskScheduler} bean has been removed.
 * Quarkus' {@code quarkus-scheduler} extension owns the scheduling thread pool, so no application
 * bean is required. To keep the "each scheduled task on its own virtual thread" behaviour, annotate
 * the individual {@code @io.quarkus.scheduler.Scheduled} methods with
 * {@code @io.smallrye.common.annotation.RunOnVirtualThread} (or configure
 * {@code quarkus.scheduler.use-virtual-threads=true} where supported).
 *
 * <p>TODO: Migration required - any injection point that received the former Spring
 * {@code TaskScheduler} bean must be rewritten to use the Quarkus scheduler API or a CDI-managed
 * {@code java.util.concurrent.ScheduledExecutorService}.
 */
public class SchedulingConfig {}
