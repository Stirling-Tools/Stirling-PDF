package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
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
                Represents a general file input for an API endpoint.

                **Exactly one** of the following two fields must be provided:
                • `fileInput` – Direct upload of a file (multipart/form-data)
                • `fileId`   – Reference to a previously stored server-side file

                **Rules:**
                - Providing **both** fields or **neither** field will trigger a validation error.
                - Use `fileId` when continuing processing on a file that was previously uploaded and stored on the server.
                """)
public class GeneralFile {

    @Schema(
            description =
                    "Uploaded file (multipart upload). "
                            + "Use this field for direct file submission from the client.",
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

    private static final int MAX_FILENAME_LENGTH = 255;

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
     * Validates the file size against application limits.
     *
     * @param fileSize the size of the file in bytes
     * @throws IllegalArgumentException if the file size exceeds the configured limit
     */
    private void validateFileSize(long fileSize) {
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
     * Validates the size of the provided file against application limits.
     *
     * @param file the MultipartFile to validate
     * @throws IllegalArgumentException if the file size exceeds the configured limit
     */
    public void validateFile(MultipartFile file) {
        validateFileSize(file.getSize());
    }
}
