package stirling.software.proprietary.storage.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.proprietary.storage.model.StorageCleanupEntry;

public interface StorageCleanupEntryRepository extends JpaRepository<StorageCleanupEntry, Long> {
    List<StorageCleanupEntry> findTop50ByOrderByUpdatedAtAsc();
}
