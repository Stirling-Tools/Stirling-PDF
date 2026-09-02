package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.MDC;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

@ApplicationScoped
public class AsyncConfig {

    private ExecutorService auditExecutorService;
    private ExecutorService aiStreamExecutorService;

    /**
     * Wraps a delegate {@link Executor} so that the caller thread's MDC context is propagated to
     * the worker (virtual) thread executing the task, then cleared afterwards to avoid leaks.
     */
    static Executor mdcPropagating(Executor delegate) {
        return command -> {
            // Capture the MDC context from the current (caller) thread
            Map<String, String> contextMap = MDC.getCopyOfContextMap();

            delegate.execute(
                    () -> {
                        try {
                            // Set the captured context on the worker thread
                            if (contextMap != null) {
                                MDC.setContextMap(contextMap);
                            }
                            // Execute the task
                            command.run();
                        } finally {
                            // Clear the context to prevent memory leaks
                            MDC.clear();
                        }
                    });
        };
    }

    @Produces
    @Named("auditExecutor")
    @ApplicationScoped
    public Executor auditExecutor() {
        auditExecutorService = Executors.newVirtualThreadPerTaskExecutor();
        return mdcPropagating(auditExecutorService);
    }

    /** Propagates the request's SecurityContext onto background AI-orchestration threads. */
    @Produces
    @Named("aiStreamExecutor")
    @ApplicationScoped
    public Executor aiStreamExecutor() {
        aiStreamExecutorService = Executors.newVirtualThreadPerTaskExecutor();
        return mdcPropagating(aiStreamExecutorService);
    }

    /** Close the underlying executors because the produced wrappers do not own their lifecycle. */
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
