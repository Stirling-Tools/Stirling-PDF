package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * MDC context-propagating task decorator Copies MDC context from the caller thread to the async
     * executor thread
     */
    static class MDCContextTaskDecorator implements TaskDecorator {
        @Override
        public Runnable decorate(Runnable runnable) {
            // Capture the MDC context from the current thread
            Map<String, String> contextMap = MDC.getCopyOfContextMap();

            return () -> {
                try {
                    // Set the captured context on the worker thread
                    if (contextMap != null) {
                        MDC.setContextMap(contextMap);
                    }
                    // Execute the task
                    runnable.run();
                } finally {
                    // Clear the context to prevent memory leaks
                    MDC.clear();
                }
            };
        }
    }

    @Bean(name = "auditExecutor")
    public Executor auditExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(2);
        exec.setMaxPoolSize(8);
        exec.setQueueCapacity(1_000);
        exec.setThreadNamePrefix("audit-");

        // Set the task decorator to propagate MDC context
        exec.setTaskDecorator(new MDCContextTaskDecorator());

        exec.initialize();
        return exec;
    }
}
