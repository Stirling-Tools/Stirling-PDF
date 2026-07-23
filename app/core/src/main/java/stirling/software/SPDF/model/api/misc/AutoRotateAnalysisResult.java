package stirling.software.SPDF.model.api.misc;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Per-page orientation report returned by auto-rotate-pdf when dryRun is set. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AutoRotateAnalysisResult {

    private List<PageResult> pages;

    private int totalPages;

    @Schema(description = "Number of pages a correction would be applied to")
    private int pagesToRotate;

    private int detectedByText;

    private int detectedByOsd;

    private int undetected;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PageResult {

        @Schema(description = "1-based page number")
        private int pageNumber;

        @Schema(description = "The page's current /Rotate value, normalised to 0-270")
        private int currentRotation;

        @Schema(
                description =
                        "Detected additional clockwise rotation that would make the page upright")
        private int correction;

        @Schema(
                description =
                        "Detection confidence: percentage of glyphs sharing the dominant direction"
                                + " for method 'text', Tesseract orientation confidence for method"
                                + " 'osd', absent when nothing was detected")
        private Double confidence;

        @Schema(
                description = "How the orientation was determined",
                allowableValues = {"text", "osd", "none"})
        private String method;

        @Schema(description = "Whether the correction will be (or was) applied")
        private boolean apply;

        @Schema(description = "Machine-readable reason when no correction is applied")
        private String note;
    }
}
