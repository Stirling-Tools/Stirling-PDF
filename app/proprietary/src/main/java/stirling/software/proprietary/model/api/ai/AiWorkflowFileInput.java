package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.core.MediaType;

import stirling.software.common.model.MultipartFile;

import lombok.Data;

@Data
@Schema(description = "A single PDF file input")
public class AiWorkflowFileInput {

    @NotNull
    @Schema(
            description = "The input PDF file",
            contentMediaType = MediaType.APPLICATION_PDF,
            format = "binary")
    private MultipartFile fileInput;
}
