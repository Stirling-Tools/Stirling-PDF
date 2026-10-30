package stirling.software.proprietary.storage.service;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.StoredFileResolver;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

/** Resolves storage references after checking the current user can read the file. */
@Component
@RequiredArgsConstructor
public class StorageStoredFileResolver implements StoredFileResolver {

    private final FileStorageService fileStorageService;

    @Override
    public MultipartFile resolve(long storedFileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile storedFile = fileStorageService.getAccessibleFile(user, storedFileId);
        fileStorageService.requireReadAccess(user, storedFile);
        return new StoredFileMultipartFile(fileStorageService, storedFile);
    }
}
