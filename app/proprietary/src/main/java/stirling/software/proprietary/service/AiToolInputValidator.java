package stirling.software.proprietary.service;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;

/**
 * Shared input-validation for AI-backed tool endpoints.
 *
 * <p>The platform's multipart max-file-size is tuned for the regular PDF tools (2 GB) — far too
 * permissive for AI tools where upload size translates directly into token budget, memory, and
 * engine cost. Every AI tool should call {@link #validatePdfUpload} on its input before doing any
 * work.
 */
public final class AiToolInputValidator {

    /**
     * Upper bound on PDF size accepted by any AI tool. Chosen so that a realistic document fits
     * (contracts, research papers, books) while capping pathological uploads that would blow the
     * engine's token budget or memory.
     */
    public static final long MAX_INPUT_FILE_BYTES = 50L * 1024 * 1024;

    private AiToolInputValidator() {}

    /**
     * Validate a PDF uploaded to an AI tool endpoint. Throws {@link WebApplicationException} with an
     * appropriate HTTP status on any failure.
     */
    public static void validatePdfUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new WebApplicationException("fileInput is required", Response.Status.BAD_REQUEST);
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.equals(MediaType.APPLICATION_PDF)) {
            throw new WebApplicationException(
                    "Only application/pdf uploads are supported", Response.Status.BAD_REQUEST);
        }
        if (file.getSize() > MAX_INPUT_FILE_BYTES) {
            throw new WebApplicationException(
                    "PDF exceeds maximum size of "
                            + (MAX_INPUT_FILE_BYTES / (1024 * 1024))
                            + " MB for AI tools",
                    Response.Status.REQUEST_ENTITY_TOO_LARGE);
        }
    }
}
