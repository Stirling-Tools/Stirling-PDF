package stirling.software.SPDF.model.api.misc;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

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
            minimum = "0",
            defaultValue = "14.0")
    @Min(value = 0, message = "Confidence threshold must be non-negative")
    private Double confidenceThreshold = 14.0;

    @Schema(
            description =
                    "If true, no rotation is applied; returns a JSON report of the per-page"
                            + " detection results instead of a PDF")
    private boolean dryRun;

    @Schema(
            description =
                    "When a page cannot be decided on its own but the pages that could be decided"
                            + " agree on a single correction for that same current rotation, apply"
                            + " that shared correction to the undecided page. Handles documents"
                            + " rotated uniformly where some pages are too sparse to detect alone",
            defaultValue = "true")
    private boolean inferUndetected = true;

    @Schema(
            description =
                    "Optional pre-computed corrections to apply without running detection. Pages"
                            + " not listed are left unchanged, and a page may only appear once")
    @Valid
    private List<PageRotation> pageRotations;
}
