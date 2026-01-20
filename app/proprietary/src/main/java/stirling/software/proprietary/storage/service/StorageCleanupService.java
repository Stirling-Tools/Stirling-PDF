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
                entry.setAttemptCount(entry.getAttemptCount() + 1);
                cleanupEntryRepository.save(entry);
                log.warn(
                        "Failed to cleanup storage key {} (attempt {})",
                        entry.getStorageKey(),
                        entry.getAttemptCount(),
                        ex);
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
