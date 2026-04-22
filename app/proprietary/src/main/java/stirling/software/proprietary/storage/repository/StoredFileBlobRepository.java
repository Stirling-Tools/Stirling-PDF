package stirling.software.proprietary.storage.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.proprietary.storage.model.StoredFileBlob;

public interface StoredFileBlobRepository extends JpaRepository<StoredFileBlob, String> {}
