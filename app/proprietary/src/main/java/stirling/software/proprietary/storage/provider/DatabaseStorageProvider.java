package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.util.UUID;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFileBlob;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

@RequiredArgsConstructor
public class DatabaseStorageProvider implements StorageProvider {

    private final StoredFileBlobRepository storedFileBlobRepository;

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        String storageKey = UUID.randomUUID().toString();
        StoredFileBlob blob = new StoredFileBlob();
        blob.setStorageKey(storageKey);
        blob.setData(file.getBytes());
        storedFileBlobRepository.save(blob);

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
                        .findById(storageKey)
                        .orElseThrow(() -> new IOException("File not found"));
        return new ByteArrayResource(blob.getData());
    }

    @Override
    public void delete(String storageKey) throws IOException {
        if (!storedFileBlobRepository.existsById(storageKey)) {
            return;
        }
        storedFileBlobRepository.deleteById(storageKey);
    }
}
