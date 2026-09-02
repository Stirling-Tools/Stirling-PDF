package stirling.software.proprietary.service;

import java.io.IOException;

import stirling.software.common.model.MultipartFile;

/**
 * Produces stable identifiers for uploaded files. The identifier is opaque to the AI engine and
 * serves as the RAG collection key when content is ingested. Swapping implementations (content
 * hash, filesystem path, tenant-scoped id, etc.) is how the system adapts to different deployment
 * models without any engine-side change.
 */
public interface FileIdStrategy {

    String idFor(MultipartFile file) throws IOException;
}
