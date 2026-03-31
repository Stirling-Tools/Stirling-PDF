package stirling.software.SPDF.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

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

    @Schema(description = "The user message to orchestrate", example = "What is the notice period?")
    private String userMessage;

    @Schema(description = "Optional conversation ID for the client workflow", example = "conv_123")
    private String conversationId;

    @Schema(description = "Optional 1-based page numbers to limit extraction scope")
    private List<Integer> pageNumbers = new ArrayList<>();

    @Schema(description = "Maximum number of pages Java may extract", example = "12")
    private Integer maxPages;

    @Schema(
            description = "Maximum number of extracted characters Java may send back to Python",
            example = "24000")
    private Integer maxCharacters;
}
