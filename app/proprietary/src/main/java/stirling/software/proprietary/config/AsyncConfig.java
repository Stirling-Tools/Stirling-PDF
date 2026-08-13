package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.security.concurrent.DelegatingSecurityContextExecutor;

import jakarta.annotation.PreDestroy;

@Configuration
@EnableAsync
public class AsyncConfig {

    private ExecutorService auditExecutorService;
    private ExecutorService aiStreamExecutorService;

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
        auditExecutorService = Executors.newVirtualThreadPerTaskExecutor();
        TaskExecutorAdapter adapter = new TaskExecutorAdapter(auditExecutorService);
        adapter.setTaskDecorator(new MDCContextTaskDecorator());
        return adapter;
    }

    /** Propagates the request's SecurityContext onto background AI-orchestration threads. */
    @Bean(name = "aiStreamExecutor")
    public Executor aiStreamExecutor() {
        aiStreamExecutorService = Executors.newVirtualThreadPerTaskExecutor();
        TaskExecutorAdapter adapter = new TaskExecutorAdapter(aiStreamExecutorService);
        adapter.setTaskDecorator(new MDCContextTaskDecorator());
        return new DelegatingSecurityContextExecutor(adapter);
    }

    /**
     * Close the underlying executors because the exposed Spring adapters do not own their
     * lifecycle.
     */
    @PreDestroy
    void shutdown() {
        shutdownExecutor(auditExecutorService);
        shutdownExecutor(aiStreamExecutorService);
    }

    private void shutdownExecutor(ExecutorService executor) {
        if (executor != null) {
            executor.shutdownNow();
        }
    }
}
