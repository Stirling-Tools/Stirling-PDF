package stirling.software.proprietary.config;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

import org.slf4j.MDC;

@ApplicationScoped
public class AsyncConfig {

    /**
     * Wraps a delegate {@link Executor} so that the caller thread's MDC context is propagated to the
     * worker (virtual) thread executing the task, then cleared afterwards to avoid leaks.
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
        return mdcPropagating(Executors.newVirtualThreadPerTaskExecutor());
    }

    /** Propagates the request's SecurityContext onto background AI-orchestration threads. */
    @Produces
    @Named("aiStreamExecutor")
    @ApplicationScoped
    public Executor aiStreamExecutor() {
        // TODO: Migration required - this previously wrapped the executor in Spring Security's
        // DelegatingSecurityContextExecutor to propagate the SecurityContext onto background
        // threads. Quarkus has no direct equivalent; the SecurityIdentity must be captured on the
        // caller thread and re-established on the worker thread (e.g. via a captured
        // io.quarkus.security.identity.SecurityIdentity or
        // org.eclipse.microprofile.context.ThreadContext from MicroProfile Context Propagation).
        // For now only MDC context is propagated; security context propagation is NOT preserved.
        return mdcPropagating(Executors.newVirtualThreadPerTaskExecutor());
    }
}
