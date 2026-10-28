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
    @Schema(
            description =
                    "Areas to redact. Text at least half inside an area, and the image content"
                            + " under it, is removed from the file and the area is painted; a page"
                            + " that cannot be redacted this way is rasterized instead.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<RedactionArea> redactions;

    @Schema(
            description =
                    "Rasterize every page of the output. The areas and pages are removed without"
                            + " it; this also turns the rest of each page into an image.",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage;

    @Schema(
            description =
                    "The color used to fill the pages listed in pageNumbers, which are wiped of"
                            + " all content and annotations",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String pageRedactionColor;
}
