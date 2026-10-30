package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class GeneralFile implements SingleFileInput {

    @Schema(
            description = "The input file",
            requiredMode = Schema.RequiredMode.REQUIRED,
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
