package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractHeaderRequest extends PDFFile {

    @Schema(
            description =
                    "Flag indicating whether to use the first text as a fallback if no suitable title is found. Defaults to false.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private Boolean useFirstTextAsFallback;
}
