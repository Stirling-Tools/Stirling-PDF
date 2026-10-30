package stirling.software.proprietary.storage.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

/** Opens a parallel chunked upload. Chunks are written by index and assembled on completion. */
public record CreateChunkedUploadRequest(
        @Schema(description = "Original filename", requiredMode = Schema.RequiredMode.REQUIRED)
                String fileName,
        @Schema(description = "MIME type of the file") String contentType,
        @Schema(description = "Total bytes", requiredMode = Schema.RequiredMode.REQUIRED)
                long sizeBytes,
        @Schema(description = "Chunk size in bytes; defaults to 4 MiB") Integer chunkSize) {}
