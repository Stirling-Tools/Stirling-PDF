package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.common.util.ExceptionUtils;

@Data
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
}
