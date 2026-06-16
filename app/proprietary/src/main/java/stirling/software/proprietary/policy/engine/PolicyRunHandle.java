package stirling.software.proprietary.policy.engine;

import java.util.concurrent.CompletableFuture;

import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * Returned by {@link PolicyEngine#submit}: the run id (for status polling and result download) plus
 * a future that resolves when the run reaches a terminal or paused state.
 *
 * <p>The completion future lets callers react to the end of a run (e.g. an SSE endpoint sending a
 * final event and closing the stream) without polling. It carries the {@link PolicyRun} whose
 * status describes the outcome (completed, failed, cancelled, or waiting for input); it does not
 * complete exceptionally for ordinary run failures.
 */
public record PolicyRunHandle(String runId, CompletableFuture<PolicyRun> completion) {}
