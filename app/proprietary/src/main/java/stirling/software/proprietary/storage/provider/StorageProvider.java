package stirling.software.proprietary.storage.provider;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.security.model.User;

public interface StorageProvider {
    StoredObject store(User owner, MultipartFile file) throws IOException;

    Resource load(String storageKey) throws IOException;

    void delete(String storageKey) throws IOException;
}
