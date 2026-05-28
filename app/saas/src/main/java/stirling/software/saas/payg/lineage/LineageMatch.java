package stirling.software.saas.payg.lineage;

import java.time.LocalDateTime;
import java.util.UUID;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Result of a successful lineage lookup: the open job a tool call should join, plus the {@link
 * ArtifactKind} of the recorded artifact that produced the match (was the matched hash the prior
 * call's input or its output?) and the job's {@code last_step_at} so the caller can decide whether
 * to extend the workflow window.
 *
 * <p>If a single job has multiple recorded signatures that all match the candidate set (e.g. both
 * its INPUT and OUTPUT hashes align with what the caller offered), {@code matchedKind} reflects one
 * of those matches — ordering across same-job-different-kind rows is unspecified. Callers needing
 * to enumerate every matched kind should query {@link JobLineageStore} directly.
 */
public record LineageMatch(UUID jobId, ArtifactKind matchedKind, LocalDateTime jobLastStepAt) {}
