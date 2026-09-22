package stirling.software.proprietary.policy.legacy;

import java.time.Instant;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Durable {@link ImportedPipelines}; the runtime bean. */
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
        } catch (DataIntegrityViolationException e) {
            if (repository.existsById(key)) {
                // A concurrent boot won the insert; the row exists either way.
                log.debug("Import marker '{}' was already recorded concurrently", key);
                return;
            }
            // Without the marker the folder is converted again on every boot and rescanned by the
            // legacy scanner in between, so this can never be swallowed quietly.
            log.error("Could not record import marker '{}'", key, e);
        }
    }
}
