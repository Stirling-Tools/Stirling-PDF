package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToVideoRequest extends PDFFile {

    @Schema(
            description = "The output video format",
            allowableValues = {"mp4", "webm"},
            defaultValue = "mp4")
    private String videoFormat = "mp4";

    @Schema(
            description = "Seconds each page should appear in the video",
            minimum = "1",
            maximum = "30",
            defaultValue = "3")
    private Integer secondsPerPage = 3;

    @Schema(
            description = "Target video resolution",
            allowableValues = {"ORIGINAL", "1080p", "720p", "480p"},
            defaultValue = "ORIGINAL")
    private String resolution = "ORIGINAL";

    @Schema(
            description = "DPI to render PDF pages before encoding",
            minimum = "72",
            maximum = "500",
            defaultValue = "150")
    private Integer dpi = 150;

    @Schema(
            description =
                    "Opacity of the watermark (only applied if a watermark text is specified)",
            minimum = "0.0",
            maximum = "1.0",
            defaultValue = "0.1")
    private Float opacity = 0.1f;

    @Schema(
            description = "Watermark text to overlay on the video",
            example = "Stirling Software",
            defaultValue = "Stirling Software")
    private String watermarkText;
}
