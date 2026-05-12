package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RedactTextRange {

    @Schema(
            description =
                    "Heading or first line of the block to redact, copied verbatim from the"
                            + " document. Everything from this line onward is redacted (inclusive).",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String startString;

    @Schema(
            description =
                    "Heading or first line of the block that immediately follows the one being"
                            + " redacted, copied verbatim. This line is NOT redacted — it is the"
                            + " exclusive upper boundary. Omit (or leave empty) only if the"
                            + " redaction genuinely runs to the end of the document.",
            defaultValue = "")
    private String endString = "";
}
