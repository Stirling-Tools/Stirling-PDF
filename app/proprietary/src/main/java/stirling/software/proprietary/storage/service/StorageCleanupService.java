package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.storage.model.StorageCleanupEntry;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.FileShareRepository;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;

@Service
@RequiredArgsConstructor
@Slf4j
public class StorageCleanupService {

    private static final int MAX_CLEANUP_ATTEMPTS = 10;

    private final StorageProvider storageProvider;
    private final StorageCleanupEntryRepository cleanupEntryRepository;
    private final FileShareRepository fileShareRepository;

    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void cleanupOrphanedStorage() {
        List<StorageCleanupEntry> entries = cleanupEntryRepository.findTop50ByOrderByUpdatedAtAsc();
        if (entries.isEmpty()) {
            return;
        }
        for (StorageCleanupEntry entry : entries) {
            try {
                storageProvider.delete(entry.getStorageKey());
                cleanupEntryRepository.delete(entry);
            } catch (IOException ex) {
                int attempts = entry.getAttemptCount() + 1;
                if (attempts >= MAX_CLEANUP_ATTEMPTS) {
                    log.error(
                            "Abandoning cleanup for storage key {} after {} failed attempts."
                                    + " The blob may be orphaned and require manual removal.",
                            entry.getStorageKey(),
                            attempts,
                            ex);
                    cleanupEntryRepository.delete(entry);
                } else {
                    entry.setAttemptCount(attempts);
                    cleanupEntryRepository.save(entry);
                    log.warn(
                            "Failed to cleanup storage key {} (attempt {}/{})",
                            entry.getStorageKey(),
                            attempts,
                            MAX_CLEANUP_ATTEMPTS,
                            ex);
                }
            }
        }
    }

    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void cleanupExpiredShareLinks() {
        List<stirling.software.proprietary.storage.model.FileShare> expired =
                fileShareRepository.findByExpiresAtBeforeAndShareTokenNotNull(LocalDateTime.now());
        if (expired.isEmpty()) {
            return;
        }
        fileShareRepository.deleteAll(expired);
    }
}
