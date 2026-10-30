package stirling.software.common.service;

import org.springframework.web.multipart.MultipartFile;

/** Resolves a persistent stored file into the MultipartFile shape tool endpoints accept. */
public interface StoredFileResolver {

    String PREFIX = "storage:";

    /**
     * @throws ResponseStatusException when the file is missing, expired, or not readable
     */
    MultipartFile resolve(long storedFileId);
}
