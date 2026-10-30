package stirling.software.proprietary.storage.model.api;

import java.util.UUID;

/** Session handle returned when a chunked upload is opened. */
public record ChunkedUploadResponse(UUID uploadId, int chunkSize, int totalChunks) {}
