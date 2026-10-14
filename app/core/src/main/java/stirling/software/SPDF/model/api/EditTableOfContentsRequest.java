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
                    "The full new outline as a JSON array of {title, pageNumber," + " children[]}",
            type = "string",
            example =
                    "[{\\\"title\\\":\\\"Chapter 1\\\",\\\"pageNumber\\\":1,\\\"children\\\":[{\\\"title\\\":\\\"Section 1.1\\\",\\\"pageNumber\\\":2}]}]")
    private String bookmarkData;

    @Schema(
            description =
                    "Ignored: existing bookmarks are always replaced. To add to them, read"
                            + " them with extract-bookmarks and send the full list.",
            example = "true")
    private Boolean replaceExisting;
}
