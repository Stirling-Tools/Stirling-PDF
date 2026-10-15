package stirling.software.proprietary.storage.service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.DistributedLock.LockHandle;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/** Deletes expired temporary files; each delete is its own transaction via the service proxy. */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageExpiryPurger {

    private static final Pageable BATCH = PageRequest.of(0, 100);
    private static final String PURGE_LOCK = "storage-expiry-purge";
    private static final Duration LOCK_LEASE = Duration.ofMinutes(5);

    private final StoredFileRepository storedFileRepository;
    private final FileStorageService fileStorageService;
    private final ApplicationProperties applicationProperties;
    private final DistributedLock distributedLock;

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void purgeExpiredFiles() {
        if (!applicationProperties.getStorage().isEnabled()) {
            return;
        }
        // One node per cycle; the others would race it to delete the same rows.
        Optional<LockHandle> lock;
        try {
            lock = distributedLock.tryAcquire(PURGE_LOCK, LOCK_LEASE);
        } catch (RuntimeException e) {
            log.warn("Could not acquire the storage purge lock ({}); skipping", e.getMessage());
            return;
        }
        if (lock.isEmpty()) {
            log.debug("Another node is purging expired stored files; skipping this cycle");
            return;
        }
        try (LockHandle held = lock.get()) {
            purge(held);
        }
    }

    private void purge(LockHandle held) {
        LocalDateTime now = LocalDateTime.now();
        // Id cursor so files that keep failing cannot pin every batch.
        long afterId = 0;
        List<StoredFile> batch;
        do {
            if (afterId > 0 && !held.renew(LOCK_LEASE)) {
                log.warn("Lost the storage purge lock; stopping until the next cycle");
                return;
            }
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
