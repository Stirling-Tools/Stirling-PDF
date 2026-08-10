package stirling.software.proprietary.policy.legacy;

import java.time.Instant;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Durable {@link ImportedPipelines} backed by JPA; the runtime bean. {@code markImported} relies on
 * the primary-key uniqueness of the import key to stay safe under a concurrent first boot:
 * whichever node inserts first wins, and the loser's duplicate insert is swallowed rather than
 * propagated, so it never disturbs the import that called it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JpaImportedPipelines implements ImportedPipelines {

    private final ImportedPipelineRepository repository;

    @Override
    public boolean isImported(String key) {
        return repository.existsById(key);
    }

    @Override
    public void markImported(String key) {
        try {
            repository.save(new ImportedPipeline(key, Instant.now()));
        } catch (DataIntegrityViolationException alreadyRecorded) {
            // A concurrent boot recorded the same key first; the row exists, so we are done.
            log.debug("Import marker '{}' was already recorded concurrently", key);
        }
    }
}
