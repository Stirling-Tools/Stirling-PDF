package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

import org.springframework.data.domain.Pageable;

/**
 * Minimal stand-in for the JPA repository: enough to exercise the store's branching without a
 * database. Ordering mirrors the real queries (newest first) since the rollup relies on it, and
 * {@link #save} enforces the {@code (team_id, dedup_key)} unique constraint the real table
 * declares.
 */
class InMemoryFileRunEventRepository implements FileRunEventRepository {

    final Map<String, FileRunEventEntity> rows = new HashMap<>();

    /**
     * Runs once at the start of the next {@link #save}, so a test can interleave a competing writer
     * between the store's read and its insert.
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
    private static List<FileRunEventEntity> page(List<FileRunEventEntity> rows, Pageable pageable) {
        return pageable == null || pageable.isUnpaged() || rows.size() <= pageable.getPageSize()
                ? rows
                : rows.subList(0, pageable.getPageSize());
    }

    private static boolean sameKind(FileRunEventEntity entity, String kindId) {
        return kindId == null || kindId.equals(entity.getKindId());
    }

    @Override
    public List<FileRunEventEntity> findByTeamAndStatus(
            Long teamId, FileRunEventStatus status, String kindId, Pageable pageable) {
        return page(
                newestFirst(
                        rows.values().stream()
                                .filter(
                                        e ->
                                                sameTeam(e, teamId)
                                                        && e.getStatus() == status
                                                        && sameKind(e, kindId))
                                .toList()),
                pageable);
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
        if (entity == null || entity.getStatus() != FileRunEventStatus.RESOLVED) {
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
            if (entity.getOrigin() != FailureOrigin.EDITOR
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
    public List<FileRunEventEntity> findByTeamAndStatusIn(
            Long teamId, List<FileRunEventStatus> statuses, String kindId, Pageable pageable) {
        return page(
                newestFirst(
                        rows.values().stream()
                                .filter(
                                        e ->
                                                sameTeam(e, teamId)
                                                        && statuses.contains(e.getStatus())
                                                        && sameKind(e, kindId))
                                .toList()),
                pageable);
    }

    @Override
    public List<FileRunEventEntity> findByTeamAndDedupKey(
            Long teamId, String dedupKey, Pageable pageable) {
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
    public <S extends FileRunEventEntity> S save(S entity) {
        if (beforeNextSave != null) {
            Runnable hook = beforeNextSave;
            beforeNextSave = null;
            hook.run();
        }
        boolean isInsert = !rows.containsKey(entity.getId());
        if (isInsert && clashesOnDedupKey(entity)) {
            throw new org.springframework.dao.DataIntegrityViolationException(
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

    // ── unused JpaRepository surface ────────────────────────────────────────
    @Override
    public void flush() {}

    @Override
    public <S extends FileRunEventEntity> S saveAndFlush(S entity) {
        return save(entity);
    }

    @Override
    public <S extends FileRunEventEntity> List<S> saveAllAndFlush(Iterable<S> entities) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void deleteAllInBatch(Iterable<FileRunEventEntity> entities) {}

    @Override
    public void deleteAllByIdInBatch(Iterable<String> ids) {}

    @Override
    public void deleteAllInBatch() {}

    @Override
    public FileRunEventEntity getOne(String id) {
        throw new UnsupportedOperationException();
    }

    @Override
    public FileRunEventEntity getById(String id) {
        throw new UnsupportedOperationException();
    }

    @Override
    public FileRunEventEntity getReferenceById(String id) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> List<S> findAll(
            org.springframework.data.domain.Example<S> example) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> List<S> findAll(
            org.springframework.data.domain.Example<S> example,
            org.springframework.data.domain.Sort sort) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> List<S> saveAll(Iterable<S> entities) {
        throw new UnsupportedOperationException();
    }

    @Override
    public List<FileRunEventEntity> findAll() {
        return List.copyOf(rows.values());
    }

    @Override
    public List<FileRunEventEntity> findAllById(Iterable<String> ids) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Optional<FileRunEventEntity> findById(String id) {
        return Optional.ofNullable(rows.get(id));
    }

    @Override
    public boolean existsById(String id) {
        return rows.containsKey(id);
    }

    @Override
    public long count() {
        return rows.size();
    }

    @Override
    public void deleteById(String id) {
        rows.remove(id);
    }

    @Override
    public void delete(FileRunEventEntity entity) {
        rows.remove(entity.getId());
    }

    @Override
    public void deleteAllById(Iterable<? extends String> ids) {}

    @Override
    public void deleteAll(Iterable<? extends FileRunEventEntity> entities) {}

    @Override
    public void deleteAll() {
        rows.clear();
    }

    @Override
    public List<FileRunEventEntity> findAll(org.springframework.data.domain.Sort sort) {
        throw new UnsupportedOperationException();
    }

    @Override
    public org.springframework.data.domain.Page<FileRunEventEntity> findAll(Pageable pageable) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> Optional<S> findOne(
            org.springframework.data.domain.Example<S> example) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> org.springframework.data.domain.Page<S> findAll(
            org.springframework.data.domain.Example<S> example, Pageable pageable) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> long count(
            org.springframework.data.domain.Example<S> example) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity> boolean exists(
            org.springframework.data.domain.Example<S> example) {
        throw new UnsupportedOperationException();
    }

    @Override
    public <S extends FileRunEventEntity, R> R findBy(
            org.springframework.data.domain.Example<S> example,
            Function<
                            org.springframework.data.repository.query.FluentQuery
                                            .FetchableFluentQuery<
                                    S>,
                            R>
                    queryFunction) {
        throw new UnsupportedOperationException();
    }
}
