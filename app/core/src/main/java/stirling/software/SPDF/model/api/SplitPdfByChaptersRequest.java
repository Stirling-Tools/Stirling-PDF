package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

/** Optional fields default to what the split-by-chapters tool in the web UI sends. */
@Data
@EqualsAndHashCode(callSuper = false)
public class SplitPdfByChaptersRequest extends PDFFile {
    @Schema(description = "Whether to include Metadata or not", defaultValue = "false")
    private Boolean includeMetadata = false;

    @Schema(description = "Whether to allow duplicates or not", defaultValue = "false")
    private Boolean allowDuplicates = false;

    @Schema(
            description =
                    "Maximum bookmark nesting level to split on: 0 splits on top-level bookmarks"
                            + " only, 1 also on their children, and so on",
            minimum = "0",
            defaultValue = "1")
    private Integer bookmarkLevel = 1;
}
