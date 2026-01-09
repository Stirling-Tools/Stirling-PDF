package stirling.software.common.model.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;

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

    private static final int MAX_FILENAME_LENGTH = 255;

    @Schema(
            description =
                    "Uploaded PDF file (multipart upload). "
                            + "Use this field for direct file submission from the client.",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary",
            type = "string")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "Identifier of a PDF file previously stored on the server. "
                            + "Alternative to uploading a new file via `fileInput`. "
                            + "Typically used in asynchronous workflows to reference an existing file.",
            example = "1234abcd-56ef-78gh-90ij-9876klmnopqr")
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

    /** Validates that uploaded filenames are safe and not attempting path traversal. */
    @AssertTrue(message = "Uploaded filename is invalid or unsafe")
    @Schema(hidden = true)
    public boolean isSafeFileName() {
        if (fileInput == null || fileInput.isEmpty()) {
            return true;
        }
        String originalFilename = fileInput.getOriginalFilename();
        if (originalFilename == null || originalFilename.isBlank()) {
            return false;
        }
        String safeFilename = Filenames.toSimpleFileName(originalFilename);
        if (safeFilename == null || safeFilename.isBlank()) {
            return false;
        }
        if (!safeFilename.equals(originalFilename)) {
            return false;
        }
        if (originalFilename.length() > MAX_FILENAME_LENGTH) {
            return false;
        }
        for (int i = 0; i < originalFilename.length(); i++) {
            if (Character.isISOControl(originalFilename.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Resolves the actual MultipartFile, either from direct upload or by retrieving the server-side
     * file using the provided fileId.
     *
     * @param fileStorage the service used to access stored files
     * @param inputFile the directly uploaded file (may be null)
     * @return the resolved MultipartFile, or null if no valid input was provided
     * @throws IOException if retrieval of a server-side file fails
     */
    public MultipartFile resolveFile(FileStorage fileStorage, MultipartFile inputFile)
            throws IOException {
        if (inputFile != null && !inputFile.isEmpty()) {
            return inputFile;
        }
        if (fileId == null || fileId.isBlank()) {
            return null;
        }
        return fileStorage.retrieveFile(fileId);
    }

    /**
     * Resolves the actual MultipartFile, either from direct upload or by retrieving the server-side
     * file using the provided fileId.
     *
     * @param fileStorage the service used to access stored files
     * @return the resolved MultipartFile, or null if no valid input was provided
     * @throws IOException if retrieval of a server-side file fails
     */
    public MultipartFile resolveFile(FileStorage fileStorage) throws IOException {
        return resolveFile(fileStorage, this.fileInput);
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

    /**
     * Validates the size of the PDF file against configured limits.
     *
     * @param fileSize the size of the file in bytes
     * @throws IllegalArgumentException if the file size exceeds the configured limit
     */
    private void validatePdfFileSize(long fileSize) {
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        String fileUploadLimit =
                properties != null ? properties.getSystem().getFileUploadLimit() : null;
        if (fileUploadLimit == null || fileUploadLimit.isBlank()) {
            return;
        }
        Long maxBytes = GeneralUtils.convertSizeToBytes(fileUploadLimit);
        if (maxBytes == null) {
            log.warn("Invalid file upload limit configured: {}", fileUploadLimit);
            return;
        }
        if (fileSize > maxBytes) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileSizeLimit",
                    "File size ({0} bytes) exceeds maximum allowed size ({1} bytes)",
                    fileSize,
                    maxBytes);
        }
    }

    /**
     * Validates the size and content type of the provided PDF file.
     *
     * @param file the PDF file to validate
     * @throws IllegalArgumentException if the file size exceeds the configured limit or if the
     *     content type is not PDF
     */
    public void validatePdfFile(MultipartFile file) {
        validatePdfFileSize(file.getSize());

        String contentType = file.getContentType();
        if (contentType != null && !isAllowedContentType(contentType)) {
            log.warn("Rejected file with unexpected content type: {}", contentType);
            throw ExceptionUtils.createPdfFileRequiredException();
        }
    }

    /**
     * Checks if the provided content type is allowed.
     *
     * @param contentType the content type to check
     * @return true if the content type is compatible with PDF, false otherwise
     */
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
