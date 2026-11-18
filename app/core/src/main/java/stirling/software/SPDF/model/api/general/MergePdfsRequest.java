package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.MultiplePDFFiles;

@Data
@EqualsAndHashCode(callSuper = true)
public class MergePdfsRequest extends MultiplePDFFiles {

    @Schema(
            description = "The type of sorting to be applied on the input files before merging.",
            allowableValues = {
                "orderProvided",
                "byFileName",
                "byDateModified",
                "byDateCreated",
                "byPDFTitle"
            },
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "orderProvided")
    private String sortType = "orderProvided";

    @Schema(
            description =
                    "Flag indicating whether to remove certification signatures from the merged"
                            + " PDF. If true, all certification signatures will be removed from the"
                            + " final merged document.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "true")
    private Boolean removeCertSign = true;

    @Schema(
            description =
                    "Flag indicating whether to generate a table of contents for the merged PDF. If true, a table of contents will be created using the input filenames as chapter names.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean generateToc = false;

    @Schema(
            description =
                    "Flag indicating whether to interleave pages from two documents (alternate merge, as in pdfsam). If true, exactly two input files are required and pages are alternated: page 1 of file 1, one page of file 2, page 2 of file 1, and so on. Useful for merging scans where front and back sides are in two separate files. TOC generation and bookmark merging are not applied in this mode.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean alternateMerge = false;

    @Schema(
            description =
                    "Only used with alternateMerge: walk the second document from its last page backwards instead of forwards. Useful when the back sides of a double-sided scan were captured in reverse order.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean reverseSecondDocument = false;

    @Schema(
            description =
                    "JSON array of client-provided IDs for each uploaded file (same order as fileInput)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String clientFileIds;
}
