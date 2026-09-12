package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractHeaderRequest extends PDFFile {

    @Schema(
            description =
                    "Flag indicating whether to use text after the keyword instead of the entire line. Defaults to false.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private Boolean useTextAfterKeyword;

    @Schema(
            description =
                    "Keyword to search for in the PDF text. The filename will be based on the line containing this keyword.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "")
    private String keyword;

    @Schema(
            description =
                    "Flag indicating whether the keyword should be treated as a regex pattern. Defaults to false.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private Boolean useRegex;

}
