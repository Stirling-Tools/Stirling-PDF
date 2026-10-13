package stirling.software.SPDF.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.model.api.security.RedactionArea;

@Data
@EqualsAndHashCode(callSuper = true)
public class ManualRedactPdfRequest extends PDFWithPageNums {
    // Shadows the shared "all" default: here these pages are blacked out entirely.
    @Schema(
            description =
                    "Pages to cover completely with a box, e.g. '1,3-5'. Not the pages of the"
                            + " areas: omit to redact only the listed areas.")
    private String pageNumbers;

    @Schema(
            description =
                    "Areas to cover with boxes: page (from 1), x and y of the top-left corner"
                            + " measured from the page's top-left, width and height, in points."
                            + " The content underneath stays in the file unless"
                            + " convertPDFToImage=true.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<RedactionArea> redactions;

    @Schema(
            description =
                    "Turn every page into an image after drawing the boxes, so the covered text"
                            + " and images are really gone. Without it the boxes only sit on top"
                            + " and the content can still be extracted. All text becomes"
                            + " unselectable.",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage = false;

    @Schema(
            description = "The color used to fully redact certain pages",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String pageRedactionColor = "#000000";
}
