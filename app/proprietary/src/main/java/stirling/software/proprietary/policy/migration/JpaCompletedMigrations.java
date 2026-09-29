package stirling.software.proprietary.policy.migration;

import java.time.Instant;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Durable {@link CompletedMigrations} backed by JPA; the runtime bean. {@code markDone} relies on
 * the primary-key uniqueness of {@link CompletedMigration#getId()} to stay safe under a concurrent
 * first boot: whichever node inserts first wins, and the loser's duplicate insert is swallowed
 * rather than propagated, so it never disturbs the migration that called it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JpaCompletedMigrations implements CompletedMigrations {

    private final CompletedMigrationRepository repository;

    @Override
    public boolean isDone(String id) {
        return repository.existsById(id);
    }

    @Override
    public void markDone(String id) {
        try {
            repository.save(new CompletedMigration(id, Instant.now()));
        } catch (DataIntegrityViolationException alreadyRecorded) {
            // A concurrent boot recorded the same marker first; the row exists, so we are done.
            log.debug("Completion marker '{}' was already recorded concurrently", id);
        }
    }
}
