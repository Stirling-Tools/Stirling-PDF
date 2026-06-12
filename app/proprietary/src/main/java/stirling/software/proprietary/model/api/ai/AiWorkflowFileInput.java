package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;

import stirling.software.common.model.MultipartFile;

@Data
@Schema(description = "A single PDF file input")
public class AiWorkflowFileInput {

    @NotNull
    @Schema(
            description = "The input PDF file",
            contentMediaType = "application/pdf",
            format = "binary")
    private MultipartFile fileInput;
}
