package stirling.software.proprietary.failure;

import java.time.Instant;

/**
 * Read model for one recorded incident: the entity's fields with the registry kind already
 * resolved.
 *
 * <p>The facets are the row's own snapshots and can differ from {@code kind}'s current facets on an
 * old row, which is the point of snapshotting, so read them here rather than from {@code kind}.
 */
public record FileRunEvent(
        String id,
        Long teamId,
        String actor,
        FailureKind kind,
        FailureKind.Stage stage,
        FailureKind.Severity severity,
        FailureKind.Scope scope,
        FailureOrigin origin,
        String policyId,
        String runId,
        String fileId,
        String detail,
        String dedupKey,
        int occurrences,
        FileRunEventStatus status,
        String statusActor,
        Instant statusAt,
        Instant createdAt,
        Instant lastSeenAt) {

    /**
     * Project an entity. An unrecognised {@code kindId} (written by a newer build, or since
     * removed) falls back to {@link FailureKind#UNKNOWN}, so the row stays readable and actionable.
     */
    public static FileRunEvent of(FileRunEventEntity entity) {
        return new FileRunEvent(
                entity.getId(),
                entity.getTeamId(),
                entity.getActor(),
                FailureKind.byId(entity.getKindId()).orElse(FailureKind.UNKNOWN),
                entity.getStage(),
                entity.getSeverity(),
                entity.getScope(),
                entity.getOrigin(),
                entity.getPolicyId(),
                entity.getRunId(),
                entity.getFileId(),
                entity.getDetail(),
                entity.getDedupKey(),
                entity.getOccurrences(),
                entity.getStatus(),
                entity.getStatusActor(),
                entity.getStatusAt(),
                entity.getCreatedAt(),
                entity.getLastSeenAt());
    }
}
