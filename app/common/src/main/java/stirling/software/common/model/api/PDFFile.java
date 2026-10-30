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
public class PDFFile implements SingleFileInput {

    @Schema(
            description = "The input PDF file",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "File ID for server-side files. Either a job file id from an async run, or a"
                            + " persistent storage reference of the form storage:<id>.")
    private String fileId;

    @AssertTrue(message = "Either fileInput or fileId must be provided")
    @Schema(hidden = true)
    private boolean isValid() {
        return fileInput != null || (fileId != null && !fileId.trim().isEmpty());
    }
}
