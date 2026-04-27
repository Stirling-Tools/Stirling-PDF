package stirling.software.SPDF.model.api.general;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.model.api.general.EditTextOperation;

@Data
@EqualsAndHashCode(callSuper = true)
public class EditTextRequest extends PDFWithPageNums {

    @Schema(
            description =
                    "Ordered list of find/replace operations to apply to the PDF text. Each"
                            + " operation runs against the current state of the document, so a"
                            + " later operation can match text produced by an earlier one. Pass as"
                            + " a JSON array, e.g."
                            + " [{\"find\":\"foo\",\"replace\":\"bar\"},{\"find\":\"baz\",\"replace\":\"qux\"}].",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<EditTextOperation> edits;

    @Schema(
            description =
                    "Whether to interpret the find string of each edit as a regular expression",
            defaultValue = "false")
    private Boolean useRegex;

    @Schema(
            description =
                    "Whether matches must be whole words (boundaries determined by non-word"
                            + " characters)",
            defaultValue = "false")
    private Boolean wholeWordSearch;
}
