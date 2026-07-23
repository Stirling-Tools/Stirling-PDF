package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AutoRotatePdfRequest extends PDFFile {

    @Schema(
            description =
                    "Detection method. 'auto' tries embedded-text direction first and falls back"
                            + " to Tesseract OSD for pages without usable text; 'text' uses only"
                            + " embedded-text direction; 'osd' forces Tesseract OSD for every page",
            allowableValues = {"auto", "text", "osd"},
            defaultValue = "auto")
    private String detectionMode = "auto";

    @Schema(
            description =
                    "Minimum Tesseract OSD orientation confidence required before a correction is"
                            + " applied. Matches OCRmyPDF's --rotate-pages-threshold scale",
            defaultValue = "14.0")
    private Double confidenceThreshold = 14.0;

    @Schema(
            description =
                    "If true, no rotation is applied; returns a JSON report of the per-page"
                            + " detection results instead of a PDF")
    private boolean dryRun;

    @Schema(
            description =
                    "Optional JSON object of pre-computed corrections to apply without running"
                            + " detection, mapping 1-based page number to additional clockwise"
                            + " degrees (multiples of 90), e.g. {\"1\":90,\"4\":180}. Pages not"
                            + " listed are left unchanged",
            example = "{\"1\":90,\"4\":180}")
    private String pageRotations;
}
