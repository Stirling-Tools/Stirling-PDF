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
                    "Pages to cover entirely, e.g. '1,3-5'. Omit to redact only the listed"
                            + " areas.")
    private String pageNumbers;

    @Schema(
            description =
                    "Areas to cover: page (from 1), x and y of the top-left corner from the"
                            + " page's top-left, width and height, in points",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<RedactionArea> redactions;

    @Schema(
            description =
                    "Turn pages into images so covered content is really removed; text"
                            + " becomes unselectable",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage = false;

    @Schema(
            description = "The color used to fully redact certain pages",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String pageRedactionColor = "#000000";
}
