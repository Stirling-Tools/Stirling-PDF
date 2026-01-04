package stirling.software.common.model.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;

@Data
@Slf4j
@NoArgsConstructor
@EqualsAndHashCode
@Schema(
        description =
                """
                Represents the input PDF for an API endpoint.

                **Exactly one** of the following two fields must be provided:
                • `fileInput` – Direct upload of a PDF file (multipart/form-data)
                • `fileId`   – Reference to a previously stored server-side file (e.g., from an asynchronous job)

                **Rules:**
                - Providing **both** fields or **neither** field will trigger a validation error.
                - Use `fileId` when continuing processing on a file that was previously uploaded and stored on the server.
                """)
public class PDFFile {

    @Schema(
            description =
                    "Uploaded PDF file (multipart upload). "
                            + "Use this field for direct file submission from the client.",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "Identifier of a PDF file previously stored on the server. "
                            + "Alternative to uploading a new file via `fileInput`. "
                            + "Typically used in asynchronous workflows to reference an existing file.",
            example = "abc123-def456-ghi789")
    private String fileId;

    /**
     * Custom validation ensuring exactly one input method is provided. The containing class or
     * field must be annotated with @Valid to trigger this check.
     */
    @AssertTrue(message = "Exactly one of 'fileInput' or 'fileId' must be provided, but not both")
    @Schema(hidden = true)
    public boolean isValid() {
        boolean hasFileInput = fileInput != null && !fileInput.isEmpty();
        boolean hasFileId = fileId != null && !fileId.trim().isEmpty();
        return hasFileInput ^ hasFileId; // XOR – exactly one must be true
    }

    @Deprecated(since = "3.0", forRemoval = true)
    private static final long MAX_FILE_SIZE = 100L * 1024 * 1024; // 100 MB

    /**
     * Resolves the actual MultipartFile, either from direct upload or by retrieving the server-side
     * file using the provided fileId.
     *
     * @param fileStorage the service used to access stored files
     * @return the resolved MultipartFile, or null if no valid input was provided
     * @throws IOException if retrieval of a server-side file fails
     */
    public MultipartFile resolveFile(FileStorage fileStorage) throws IOException {
        if (fileInput != null && !fileInput.isEmpty()) {
            return fileInput;
        }
        if (fileId == null || fileId.isBlank()) {
            return null;
        }
        return fileStorage.retrieveFile(fileId);
    }

    /** Returns the size of the input PDF in bytes. */
    public long resolveFileSize(FileStorage fileStorage) throws IOException {
        if (fileInput != null && !fileInput.isEmpty()) {
            return fileInput.getSize();
        }
        if (fileId == null || fileId.isBlank()) {
            return 0L;
        }
        return fileStorage.getFileSize(fileId);
    }

    private void validatePdfFileSize(long fileSize) {
        if (fileSize > MAX_FILE_SIZE) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileSizeLimit",
                    "File size ({0} bytes) exceeds maximum allowed size ({1} bytes)",
                    fileSize,
                    MAX_FILE_SIZE);
        }
    }

    /**
     * Validates a directly uploaded PDF file: - Checks size limit (100 MB) - Verifies Content-Type
     * compatibility with application/pdf
     */
    public void validatePdfFile(MultipartFile file) {
        validatePdfFileSize(file.getSize());

        String contentType = file.getContentType();
        if (contentType != null && !isAllowedContentType(contentType)) {
            log.warn("Rejected file with unexpected content type: {}", contentType);
            throw ExceptionUtils.createPdfFileRequiredException();
        }
    }

    private boolean isAllowedContentType(String contentType) {
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            return mediaType.isCompatibleWith(MediaType.APPLICATION_PDF);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid content type provided: {}", contentType);
            return false;
        }
    }
}
