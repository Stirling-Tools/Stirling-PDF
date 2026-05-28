package stirling.software.saas.payg.lineage;

import java.time.LocalDateTime;
import java.util.UUID;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Result of a successful lineage lookup: the open job a tool call should join, plus the {@link
 * ArtifactKind} of the recorded artifact that produced the match (was the matched hash the prior
 * call's input or its output?) and the job's {@code last_step_at} so the caller can decide whether
 * to extend the workflow window.
 */
public record LineageMatch(UUID jobId, ArtifactKind matchedKind, LocalDateTime jobLastStepAt) {}
