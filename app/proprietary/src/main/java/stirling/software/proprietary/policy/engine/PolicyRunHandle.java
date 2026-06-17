package stirling.software.proprietary.policy.engine;

import java.util.concurrent.CompletableFuture;

import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * Returned by {@link PolicyEngine#submit}: the run id (status polling, result download) plus a
 * future that resolves when the run reaches a terminal or paused state. The future carries the
 * {@link PolicyRun} whose status describes the outcome; it does not complete exceptionally for
 * ordinary run failures.
 */
public record PolicyRunHandle(String runId, CompletableFuture<PolicyRun> completion) {}
