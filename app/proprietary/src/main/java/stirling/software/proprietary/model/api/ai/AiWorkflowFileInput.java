package stirling.software.proprietary.model.api.ai;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "A single PDF file input")
public class AiWorkflowFileInput {

    @NotNull
    @Schema(
            description = "The input PDF file",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary")
    private MultipartFile fileInput;
}
