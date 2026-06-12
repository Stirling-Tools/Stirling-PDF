package stirling.software.common.model.api;

// TODO: Migration required - org.springframework.web.multipart.MultipartFile has no
// servlet/JAX-RS drop-in for a DTO field type. Changing this public field type to
// byte[]/InputStream or a JAX-RS multipart type would ripple to all callers and the
// API binding layer, so the type is kept until callers are migrated together.
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

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
