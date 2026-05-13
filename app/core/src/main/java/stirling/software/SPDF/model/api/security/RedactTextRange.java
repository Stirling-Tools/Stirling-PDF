package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RedactTextRange {

    @Schema(
            description = "First line of the block to redact, copied verbatim",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String startString;

    @Schema(
            description =
                    "Exclusive end marker - first line after the redacted block, copied verbatim."
                            + " Omit to redact to the end of the document.",
            defaultValue = "")
    private String endString = "";
}
