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
                PDF input – **exactly one** of the two fields must be provided:
                - Either upload a file via 'fileInput'
                - OR reference a server-side file via 'fileId'
                **Do not send both or none** – this will result in a validation error.
                """)
public class PDFFile {

    @Schema(
            description = "The input PDF file",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "File ID for server-side files (can be used instead of fileInput if job was"
                            + " previously done on file in async mode)")
    private String fileId;

    @AssertTrue(message = "Either fileInput or fileId must be provided")
    @Schema(hidden = true)
    public boolean isValid() {
        boolean hasFileInput = fileInput != null && !fileInput.isEmpty();
        boolean hasFileId = fileId != null && !fileId.trim().isEmpty();
        return hasFileInput != hasFileId;
    }

    public MultipartFile resolveFile(FileStorage fileStorage) throws IOException {
        if (fileInput != null) {
            return fileInput;
        }
        if (fileId == null || fileId.isBlank()) {
            return null;
        }
        return fileStorage.retrieveFile(fileId);
    }

    public long resolveFileSize(FileStorage fileStorage) throws IOException {
        if (fileInput != null) {
            return fileInput.getSize();
        }
        if (fileId == null || fileId.isBlank()) {
            return 0L;
        }
        return fileStorage.getFileSize(fileId);
    }

    private static final long MAX_FILE_SIZE = 100L * 1024 * 1024;

    private void validatePdfFileSize(long fileSize) {
        if (fileSize > MAX_FILE_SIZE) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileSizeLimit",
                    "File size ({0} bytes) exceeds maximum allowed size ({1} bytes)",
                    fileSize,
                    MAX_FILE_SIZE);
        }
    }

    public void validatePdfFile(MultipartFile file) {
        validatePdfFileSize(file.getSize());
        String contentType = file.getContentType();
        if (contentType != null && !isAllowedContentType(contentType)) {
            log.warn("File content type is {}, expected application/pdf", contentType);
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
