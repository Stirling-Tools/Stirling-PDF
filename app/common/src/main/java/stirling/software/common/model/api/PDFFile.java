package stirling.software.common.model.api;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
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
}
