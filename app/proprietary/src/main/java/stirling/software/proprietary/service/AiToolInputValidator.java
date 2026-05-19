package stirling.software.proprietary.service;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Shared input-validation for AI-backed tool endpoints.
 *
 * <p>Spring's {@code spring.servlet.multipart.max-file-size} is tuned for the regular PDF tools (2
 * GB) — far too permissive for AI tools where upload size translates directly into token budget,
 * memory, and engine cost. Every AI tool should call {@link #validatePdfUpload} on its input before
 * doing any work.
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
     * Validate a PDF uploaded to an AI tool endpoint. Throws {@link ResponseStatusException} with
     * an appropriate HTTP status on any failure.
     */
    public static void validatePdfUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileInput is required");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.equals(MediaType.APPLICATION_PDF_VALUE)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Only application/pdf uploads are supported");
        }
        if (file.getSize() > MAX_INPUT_FILE_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "PDF exceeds maximum size of "
                            + (MAX_INPUT_FILE_BYTES / (1024 * 1024))
                            + " MB for AI tools");
        }
    }
}
