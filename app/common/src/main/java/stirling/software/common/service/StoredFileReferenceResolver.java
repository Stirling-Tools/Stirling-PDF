package stirling.software.common.service;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

/** Parses {@code storage:<id>} references and delegates them to the storage module. */
@Component
@RequiredArgsConstructor
public class StoredFileReferenceResolver {

    private final ObjectProvider<StoredFileResolver> resolverProvider;

    public boolean isStoredFileReference(String fileId) {
        return fileId != null && fileId.startsWith(StoredFileResolver.PREFIX);
    }

    /**
     * @throws ResponseStatusException 400 malformed, 501 no storage module, or storage 404/403
     */
    public MultipartFile resolve(String fileId) {
        if (!isStoredFileReference(fileId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Not a stored file reference: " + fileId);
        }
        StoredFileResolver resolver = resolverProvider.getIfAvailable();
        if (resolver == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED, "Server-side file storage is not available");
        }
        String rawId = fileId.substring(StoredFileResolver.PREFIX.length());
        try {
            return resolver.resolve(Long.parseLong(rawId));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid stored file id: " + rawId, e);
        }
    }

    public MultipartFile[] resolveAll(List<String> fileIds) {
        MultipartFile[] files = new MultipartFile[fileIds.size()];
        for (int i = 0; i < fileIds.size(); i++) {
            files[i] = resolve(fileIds.get(i));
        }
        return files;
    }
}
