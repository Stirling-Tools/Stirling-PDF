package stirling.software.SPDF.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "Run an AI workflow against a PDF file")
public class AiWorkflowRequest extends PDFFile {

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
