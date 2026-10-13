package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = false)
public class EditTableOfContentsRequest extends PDFFile {

    @Schema(
            description =
                    "The complete new outline as a JSON array of {title, pageNumber (1-based),"
                            + " children[]}, where children nests the same shape and may be"
                            + " omitted. Page numbers out of range point to the first or last"
                            + " page.",
            type = "string",
            example =
                    "[{\\\"title\\\":\\\"Chapter 1\\\",\\\"pageNumber\\\":1,\\\"children\\\":[{\\\"title\\\":\\\"Section 1.1\\\",\\\"pageNumber\\\":2}]}]")
    private String bookmarkData;

    @Schema(
            description =
                    "Not used: existing bookmarks are always replaced by bookmarkData. To add"
                            + " to them, read the current ones with extract-bookmarks and send the"
                            + " full list.",
            example = "true")
    private Boolean replaceExisting;
}
