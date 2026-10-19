package stirling.software.common.configuration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.SimpleAsyncTaskScheduler;

/**
 * Configures the scheduler that runs {@code @Scheduled} methods and first-use task registrations.
 * Uses virtual threads so long-running scheduled tasks (e.g. cleanup, license checks, file
 * monitoring) never block each other — each runs on its own lightweight virtual thread.
 */
@Configuration
public class SchedulingConfig {

    @Bean
    public TaskScheduler taskScheduler() {
        SimpleAsyncTaskScheduler scheduler = new SimpleAsyncTaskScheduler();
        scheduler.setVirtualThreads(true);
        scheduler.setThreadNamePrefix("scheduled-vt-");
        return scheduler;
    }
}
