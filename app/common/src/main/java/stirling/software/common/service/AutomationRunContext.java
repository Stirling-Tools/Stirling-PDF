package stirling.software.common.service;

/**
 * Thread-scoped correlation id for one automation run — a single pipeline, policy, or AI-workflow
 * execution over its input file(s).
 *
 * <p>Automations dispatch each tool step as a separate internal loopback POST via {@link
 * InternalApiClient}. The orchestrator opens a run scope around its dispatch loop; {@code
 * InternalApiClient} reads {@link #current()} and stamps it on every sub-step request as {@link
 * #RUN_ID_HEADER}. The SaaS PAYG interceptor uses that header so all sub-steps of ONE run group
 * into a single charge, while two <em>separate</em> runs that happen to touch identical bytes stay
 * distinct charges (the old content+time-window grouping merged them).
 *
 * <p>Sub-steps dispatch synchronously on the orchestrator's own thread (loopback {@code
 * RestTemplate}), so this ThreadLocal is visible to {@code InternalApiClient}. The id then crosses
 * to the receiving request thread via the HTTP header — never via this ThreadLocal.
 *
 * <p>No-op when the id is absent (a standalone tool call): the interceptor treats a missing run id
 * as "its own charge", which is exactly what a one-off call should be.
 */
public final class AutomationRunContext {

    /** Header carrying the run id on internal sub-step dispatches. */
    public static final String RUN_ID_HEADER = "X-Stirling-Run-Id";

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private AutomationRunContext() {}

    /**
     * Opens a run scope on the current thread. Returns an {@link AutoCloseable} that restores the
     * previously-active id (nesting-safe) — use in try-with-resources around the dispatch loop.
     */
    public static Scope open(String runId) {
        String previous = CURRENT.get();
        CURRENT.set(runId);
        return () -> {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        };
    }

    /** The run id active on this thread, or {@code null} when not inside a run scope. */
    public static String current() {
        return CURRENT.get();
    }

    /** AutoCloseable whose {@link #close()} declares no checked exception. */
    public interface Scope extends AutoCloseable {
        @Override
        void close();
    }
}
