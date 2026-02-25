package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.annotation.EnableAsync;

@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * MDC context-propagating task decorator. Copies MDC context from the caller thread to the
     * virtual thread executing the task.
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
        TaskExecutorAdapter adapter =
                new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
        adapter.setTaskDecorator(new MDCContextTaskDecorator());
        return adapter;
    }
}
