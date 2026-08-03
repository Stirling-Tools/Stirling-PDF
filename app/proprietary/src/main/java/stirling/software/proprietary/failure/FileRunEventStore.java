package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Durable store for recorded incidents. Who may act lives in {@link FileRunEventService}.
 *
 * <p>{@link #record} folds a repeat into the existing incident rather than inserting again, keyed
 * on {@code (teamId, dedupKey)}. That matters for a stateless {@code snapshot} source, which
 * re-lists every file on each sweep: the same broken file is one incident, not one per sweep.
 * Distinct files keep distinct rows, so a reviewer can still act on any one of them.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileRunEventStore {

    /** Only ever need the newest match; the index is ordered so this is a single-row read. */
    private static final Pageable NEWEST = PageRequest.of(0, 1);

    private final FileRunEventRepository repository;

    /**
     * Record a failure, folding it into an existing incident when one matches.
     *
     * <p>Deliberately not {@code @Transactional}: each repository call runs in its own transaction,
     * so losing the insert race below leaves no rolled-back transaction to recover from.
     */
    public FileRunEvent record(RecordFailure command) {
        String dedupKey = command.dedupKey();
        Instant now = Instant.now();

        Optional<FileRunEventEntity> existing = findByDedupKey(command.teamId(), dedupKey);
        if (existing.isPresent()) {
            return FileRunEvent.of(absorb(existing.get(), command, now));
        }

        try {
            return FileRunEvent.of(insert(command, dedupKey, now));
        } catch (DataIntegrityViolationException e) {
            // The unique constraint fired, so a concurrent writer inserted this incident between
            // our
            // read and our insert. Their row is the incident; fold into it instead of failing.
            return findByDedupKey(command.teamId(), dedupKey)
                    .map(row -> FileRunEvent.of(absorb(row, command, now)))
                    .orElseThrow(() -> e);
        }
    }

    private Optional<FileRunEventEntity> findByDedupKey(Long teamId, String dedupKey) {
        return repository.findByTeamAndDedupKey(teamId, dedupKey, NEWEST).stream().findFirst();
    }

    /**
     * Fold a repeat into an existing incident. {@code DISMISSED} stays dismissed, so a reviewer's
     * "stop showing me this" holds; {@code RESOLVED} reopens, so a recurrence is visible again.
     */
    private FileRunEventEntity absorb(
            FileRunEventEntity entity, RecordFailure command, Instant now) {
        entity.setOccurrences(entity.getOccurrences() + 1);
        entity.setLastSeenAt(now);
        if (command.detail() != null) {
            entity.setDetail(command.detail());
        }
        if (entity.getStatus() == FileRunEventStatus.RESOLVED) {
            entity.setStatus(FileRunEventStatus.NEW);
            entity.setStatusActor(null);
            entity.setStatusAt(null);
        }
        return repository.save(entity);
    }

    private FileRunEventEntity insert(RecordFailure command, String dedupKey, Instant now) {
        FailureKind kind = command.kind();
        FileRunEventEntity entity = new FileRunEventEntity();
        entity.setId(UUID.randomUUID().toString());
        entity.setTeamId(command.teamId());
        entity.setActor(command.actor());
        entity.setKindId(kind.getId());
        // Snapshot the facets so a later registry edit does not rewrite what this row meant.
        entity.setStage(kind.getStage());
        entity.setSeverity(kind.getSeverity());
        entity.setScope(kind.getScope());
        entity.setOrigin(command.origin());
        entity.setPolicyId(command.policyId());
        entity.setRunId(command.runId());
        entity.setFileId(command.fileId());
        entity.setDetail(command.detail());
        entity.setDedupKey(dedupKey);
        entity.setOccurrences(1);
        entity.setStatus(FileRunEventStatus.NEW);
        entity.setCreatedAt(now);
        entity.setLastSeenAt(now);
        return repository.save(entity);
    }

    @Transactional(readOnly = true)
    public List<FileRunEvent> list(Long teamId, FileRunEventStatus status, int limit) {
        Pageable page = PageRequest.of(0, Math.max(1, limit));
        List<FileRunEventEntity> rows =
                status == null
                        ? repository.findByTeam(teamId, page)
                        : repository.findByTeamAndStatus(teamId, status, page);
        return rows.stream().map(FileRunEvent::of).toList();
    }

    @Transactional(readOnly = true)
    public Optional<FileRunEvent> find(String id, Long teamId) {
        return repository.findByIdAndTeam(id, teamId).map(FileRunEvent::of);
    }

    @Transactional
    public FileRunEvent applyStatus(
            String id, Long teamId, FileRunEventStatus target, String actor) {
        FileRunEventEntity entity =
                repository
                        .findByIdAndTeam(id, teamId)
                        .orElseThrow(() -> new IllegalArgumentException("unknown event: " + id));
        entity.setStatus(target);
        entity.setStatusActor(actor);
        entity.setStatusAt(Instant.now());
        return FileRunEvent.of(repository.save(entity));
    }
}
