package stirling.software.proprietary.storage.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.storage.model.StorageCleanupEntry;
import stirling.software.proprietary.storage.repository.StorageCleanupEntryRepository;

// Separate bean on purpose: callers enqueue from afterCommit and from rollback compensation, where
// the caller's transaction can no longer flush, and REQUIRES_NEW only applies through the proxy.
@Service
@RequiredArgsConstructor
public class StorageCleanupQueue {

    private final StorageCleanupEntryRepository cleanupEntryRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void enqueue(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return;
        }
        StorageCleanupEntry entry = new StorageCleanupEntry();
        entry.setStorageKey(storageKey);
        cleanupEntryRepository.save(entry);
    }
}
