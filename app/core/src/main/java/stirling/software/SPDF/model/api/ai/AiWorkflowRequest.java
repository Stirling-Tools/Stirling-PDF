package stirling.software.SPDF.model.api.ai;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "Run an AI workflow against a PDF file")
public class AiWorkflowRequest {

    @NotNull
    @Schema(
            description = "The input PDF file",
            contentMediaType = MediaType.APPLICATION_PDF_VALUE,
            format = "binary")
    private MultipartFile fileInput;

    @NotBlank
    @Schema(description = "The user message to orchestrate", example = "What is the notice period?")
    private String userMessage;
}
