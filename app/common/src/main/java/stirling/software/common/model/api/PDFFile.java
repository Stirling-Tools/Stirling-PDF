package stirling.software.common.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.common.model.MultipartFile;

@Data
@NoArgsConstructor
@EqualsAndHashCode
public class PDFFile {

    @Schema(
            description = "The input PDF file",
            contentMediaType = "application/pdf",
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "File ID for server-side files (can be used instead of fileInput if job was previously done on file in async mode)")
    private String fileId;

    @AssertTrue(message = "Either fileInput or fileId must be provided")
    @Schema(hidden = true)
    private boolean isValid() {
        return (fileInput != null && (fileId == null || fileId.trim().isEmpty()))
                || (fileId != null && !fileId.trim().isEmpty() && fileInput == null);
    }
}
