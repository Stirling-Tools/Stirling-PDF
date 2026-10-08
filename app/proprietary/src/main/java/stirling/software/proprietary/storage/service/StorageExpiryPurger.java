package stirling.software.proprietary.storage.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/** Deletes expired temporary files; each delete is its own transaction via the service proxy. */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageExpiryPurger {

    private static final Pageable BATCH = PageRequest.of(0, 100);

    private final StoredFileRepository storedFileRepository;
    private final FileStorageService fileStorageService;
    private final ApplicationProperties applicationProperties;

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void purgeExpiredFiles() {
        if (!applicationProperties.getStorage().isEnabled()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        // Id cursor so files that keep failing cannot pin every batch.
        long afterId = 0;
        List<StoredFile> batch;
        do {
            batch = storedFileRepository.findExpiredAfterId(now, afterId, BATCH);
            for (StoredFile file : batch) {
                afterId = file.getId();
                try {
                    fileStorageService.deleteFile(file.getOwner(), file);
                } catch (RuntimeException e) {
                    log.warn("Failed to purge expired stored file {}", file.getId(), e);
                }
            }
        } while (!batch.isEmpty());
    }
}
