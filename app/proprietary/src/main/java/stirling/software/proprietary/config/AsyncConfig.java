package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.security.concurrent.DelegatingSecurityContextExecutor;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

@Slf4j
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
    public Executor auditExecutor(
            @Value("${stirling.audit.executor.max-concurrency:4}") int maxConcurrency,
            @Value("${stirling.audit.executor.queue-capacity:10000}") int queueCapacity) {
        auditExecutorService = boundedExecutor(maxConcurrency, queueCapacity);
        TaskExecutorAdapter adapter = new TaskExecutorAdapter(auditExecutorService);
        adapter.setTaskDecorator(new MDCContextTaskDecorator());
        return adapter;
    }

    static ThreadPoolExecutor boundedExecutor(int maxConcurrency, int queueCapacity) {
        return new ThreadPoolExecutor(
                maxConcurrency,
                maxConcurrency,
                0L,
                TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(queueCapacity),
                Thread.ofVirtual().name("audit-", 0).factory(),
                new DropAndCount());
    }

    static final class DropAndCount implements RejectedExecutionHandler {
        private final AtomicLong dropped = new AtomicLong();

        @Override
        public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
            long total = dropped.incrementAndGet();
            if (total == 1 || total % 1000 == 0) {
                log.warn(
                        "Audit write queue full ({} queued); {} writes dropped so far",
                        executor.getQueue().size(),
                        total);
            }
        }

        long dropped() {
            return dropped.get();
        }
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
        drainQueuedAuditWrites();
        shutdownExecutor(auditExecutorService);
        shutdownExecutor(aiStreamExecutorService);
    }

    private void drainQueuedAuditWrites() {
        if (auditExecutorService == null) {
            return;
        }
        auditExecutorService.shutdown();
        try {
            auditExecutorService.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void shutdownExecutor(ExecutorService executor) {
        if (executor != null) {
            executor.shutdownNow();
        }
    }
}
