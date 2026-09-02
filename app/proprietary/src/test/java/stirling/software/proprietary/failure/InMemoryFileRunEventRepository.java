package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import jakarta.persistence.PersistenceException;

/**
 * Minimal stand-in for the Panache repository: enough to exercise the store's branching without a
 * database. Ordering mirrors the real queries (newest first) since the rollup relies on it, and
 * {@link #insert} enforces the {@code (team_id, dedup_key)} unique constraint the real table
 * declares.
 *
 * <p>Extends the real repository rather than implementing an interface (Panache repositories are
 * classes), overriding every method the store actually calls; nothing here touches a session.
 */
class InMemoryFileRunEventRepository extends FileRunEventRepository {

    final Map<String, FileRunEventEntity> rows = new HashMap<>();

    /**
     * Runs once at the start of the next {@link #insert}, so a test can interleave a competing
     * writer between the store's read and its insert.
     */
    Runnable beforeNextSave;

    private static boolean sameTeam(FileRunEventEntity entity, Long teamId) {
        return teamId == null ? entity.getTeamId() == null : teamId.equals(entity.getTeamId());
    }

    private List<FileRunEventEntity> newestFirst(List<FileRunEventEntity> matches) {
        List<FileRunEventEntity> sorted = new ArrayList<>(matches);
        sorted.sort(
                (a, b) -> {
                    int byTime = b.getLastSeenAt().compareTo(a.getLastSeenAt());
                    // Stable tiebreak: identical timestamps are common in fast tests.
                    return byTime != 0 ? byTime : a.getId().compareTo(b.getId());
                });
        return sorted;
    }

    /** The real queries page in SQL, so the fake must page too or limit tests test nothing. */
    private static List<FileRunEventEntity> page(List<FileRunEventEntity> rows, int limit) {
        return limit <= 0 || rows.size() <= limit ? rows : rows.subList(0, limit);
    }

    private static boolean sameKind(FileRunEventEntity entity, String kindId) {
        return kindId == null || kindId.equals(entity.getKindId());
    }

    /** Null means the whole team, matching the JPQL's {@code ?4 is null} branch. */
    private static boolean sameActor(FileRunEventEntity entity, String actor) {
        return actor == null || actor.equals(entity.getActor());
    }

    @Override
    public List<FileRunEventEntity> findByTeamAndStatus(
            Long teamId, FileRunEventStatus status, String kindId, String actor, int limit) {
        return page(
                newestFirst(
                        rows.values().stream()
                                .filter(
                                        e ->
                                                sameTeam(e, teamId)
                                                        && e.getStatus() == status
                                                        && sameKind(e, kindId)
                                                        && sameActor(e, actor))
                                .toList()),
                limit);
    }

    @Override
    public List<FileRunEventEntity> findByTeamAndStatusIn(
            Long teamId,
            List<FileRunEventStatus> statuses,
            String kindId,
            String actor,
            int limit) {
        return page(
                newestFirst(
                        rows.values().stream()
                                .filter(
                                        e ->
                                                sameTeam(e, teamId)
                                                        && statuses.contains(e.getStatus())
                                                        && sameKind(e, kindId)
                                                        && sameActor(e, actor))
                                .toList()),
                limit);
    }

    @Override
    public int fold(String id, Instant now, String detail) {
        FileRunEventEntity entity = rows.get(id);
        if (entity == null) {
            return 0;
        }
        entity.setOccurrences(entity.getOccurrences() + 1);
        entity.setLastSeenAt(now);
        if (detail != null) {
            entity.setDetail(detail);
        }
        return 1;
    }

    @Override
    public int reopenIfResolved(String id) {
        FileRunEventEntity entity = rows.get(id);
        if (entity == null
                || (entity.getStatus() != FileRunEventStatus.RESOLVED
                        && entity.getStatus() != FileRunEventStatus.FILE_REMOVED)) {
            return 0;
        }
        entity.setStatus(FileRunEventStatus.NEW);
        entity.setStatusActor(null);
        entity.setStatusAt(null);
        return 1;
    }

    @Override
    public int applyStatusIf(
            String id,
            Long teamId,
            FileRunEventStatus target,
            String actor,
            Instant now,
            Collection<FileRunEventStatus> allowedFrom) {
        FileRunEventEntity entity = rows.get(id);
        if (entity == null
                || !sameTeam(entity, teamId)
                || !allowedFrom.contains(entity.getStatus())) {
            return 0;
        }
        entity.setStatus(target);
        entity.setStatusActor(actor);
        entity.setStatusAt(now);
        return 1;
    }

    @Override
    public int markFilesRemoved(
            Long teamId,
            String actor,
            Collection<String> fileIds,
            Instant now,
            Collection<FileRunEventStatus> allowedFrom) {
        int closed = 0;
        for (FileRunEventEntity entity : rows.values()) {
            // Mirrors the real query: scoped by the absence of a source, not by origin.
            if (entity.getSourceId() != null
                    || !sameTeam(entity, teamId)
                    || !Objects.equals(entity.getActor(), actor)
                    || entity.getFileId() == null
                    || !fileIds.contains(entity.getFileId())
                    || !allowedFrom.contains(entity.getStatus())) {
                continue;
            }
            entity.setStatus(FileRunEventStatus.FILE_REMOVED);
            entity.setStatusActor(actor);
            entity.setStatusAt(now);
            closed++;
        }
        return closed;
    }

    @Override
    public List<FileRunEventEntity> findByTeamAndDedupKey(Long teamId, String dedupKey, int limit) {
        return newestFirst(
                rows.values().stream()
                        .filter(e -> sameTeam(e, teamId) && dedupKey.equals(e.getDedupKey()))
                        .toList());
    }

    @Override
    public Optional<FileRunEventEntity> findByIdAndTeam(String id, Long teamId) {
        return Optional.ofNullable(rows.get(id)).filter(e -> sameTeam(e, teamId));
    }

    @Override
    public Optional<FileRunEventEntity> findByIdOptional(String id) {
        return Optional.ofNullable(rows.get(id));
    }

    @Override
    public FileRunEventEntity insert(FileRunEventEntity entity) {
        if (beforeNextSave != null) {
            Runnable hook = beforeNextSave;
            beforeNextSave = null;
            hook.run();
        }
        boolean isInsert = !rows.containsKey(entity.getId());
        if (isInsert && clashesOnDedupKey(entity)) {
            // What Hibernate surfaces for a unique-constraint violation at flush, and what the
            // store catches to fold into the winning row.
            throw new PersistenceException(
                    "uk_file_run_events_dedup violated for " + entity.getDedupKey());
        }
        rows.put(entity.getId(), entity);
        return entity;
    }

    /** Mirrors the unique constraint. SQL treats NULL teams as distinct, and so does this. */
    private boolean clashesOnDedupKey(FileRunEventEntity candidate) {
        if (candidate.getTeamId() == null) {
            return false;
        }
        return rows.values().stream()
                .anyMatch(
                        row ->
                                candidate.getTeamId().equals(row.getTeamId())
                                        && candidate.getDedupKey().equals(row.getDedupKey()));
    }
}
