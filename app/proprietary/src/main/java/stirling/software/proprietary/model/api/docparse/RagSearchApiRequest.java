package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RagSearchApiRequest {

    @Schema(
            description = "Natural-language search query",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String query;

    @Schema(description = "Number of passages to return (1-50)", defaultValue = "10")
    private int topK = 10;
}
