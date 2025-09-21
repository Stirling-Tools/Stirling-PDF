package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@EqualsAndHashCode
@Schema(description = "PDF file input - either upload a file or provide a server-side file ID")
public class PDFFile {
    @Schema(description = "The input PDF file", format = "binary")
    private MultipartFile fileInput;

    @Schema(description = "File ID for server-side files (can be used instead of fileInput)")
    private String fileId;

    @AssertTrue(message = "Either fileInput or fileId must be provided")
    @Schema(hidden = true)
    private boolean isValid() {
        return (fileInput != null && (fileId == null || fileId.trim().isEmpty()))
                || (fileId != null && !fileId.trim().isEmpty() && fileInput == null);
    }
}
