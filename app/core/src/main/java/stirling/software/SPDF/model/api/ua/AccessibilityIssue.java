package stirling.software.SPDF.model.api.ua;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

/** One accessibility problem, grouped across all of its occurrences. */
@Data
@Schema(description = "A single accessibility issue found in a document")
public class AccessibilityIssue {

    @Schema(description = "ISO 14289 clause, e.g. 7.3")
    private String clause;

    @Schema(description = "Test number within the clause")
    private String testNumber;

    @Schema(description = "Plain-English description of the problem")
    private String message;

    @Schema(description = "The validator's own wording, for support and debugging")
    private String technicalMessage;

    @Schema(description = "error or warning")
    private String severity = "error";

    @Schema(description = "Standard the check came from, e.g. PDF/UA-1")
    private String specification;

    @Schema(description = "Where the problem was found, when the validator reports it")
    private String location;

    @Schema(description = "How many times this issue occurs")
    private int occurrences;

    @Schema(description = "True when the converter can fix this without human input")
    private boolean autoFixable;
}
