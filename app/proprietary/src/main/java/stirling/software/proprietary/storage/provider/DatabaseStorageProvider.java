package stirling.software.proprietary.storage.provider;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.model.io.Resource;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFileBlob;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

@ApplicationScoped
@RequiredArgsConstructor(onConstructor_ = {@Inject})
public class DatabaseStorageProvider implements StorageProvider {

    private final StoredFileBlobRepository storedFileBlobRepository;

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        String storageKey = UUID.randomUUID().toString();
        StoredFileBlob blob = new StoredFileBlob();
        blob.setStorageKey(storageKey);
        blob.setData(file.getBytes());
        storedFileBlobRepository.persist(blob);

        return StoredObject.builder()
                .storageKey(storageKey)
                .originalFilename(file.getOriginalFilename())
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
                .build();
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        StoredFileBlob blob =
                storedFileBlobRepository
                        .findByIdOptional(storageKey)
                        .orElseThrow(() -> new IOException("File not found"));
        // Quarkus/Jakarta has no Spring ByteArrayResource; use the common InputStreamResource shim.
        return new InputStreamResource(new ByteArrayInputStream(blob.getData()), storageKey);
    }

    @Override
    public void delete(String storageKey) throws IOException {
        if (!storedFileBlobRepository.findByIdOptional(storageKey).isPresent()) {
            return;
        }
        storedFileBlobRepository.deleteById(storageKey);
    }
}
