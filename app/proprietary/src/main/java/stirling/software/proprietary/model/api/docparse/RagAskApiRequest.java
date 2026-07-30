package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RagAskApiRequest {

    @Schema(
            description = "Question to answer from the indexed documents",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String question;

    @Schema(description = "Number of passages to ground the answer on (1-20)", defaultValue = "5")
    private int topK = 5;
}
