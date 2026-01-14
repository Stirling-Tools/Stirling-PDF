package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class OptimizePdfRequest extends PDFFile {

    @Schema(
            description =
                    "The level of optimization to apply to the PDF file. Higher values indicate"
                            + " greater compression but may reduce quality.",
            type = "integer",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"})
    private Integer optimizeLevel = 5;

    @Schema(
            description = "The expected output size, e.g. '100MB', '25KB', etc.",
            defaultValue = "25KB",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String expectedOutputSize;

    @Schema(
            description = "Whether to linearize the PDF for faster web viewing. Default is false.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean linearize = false;

    @Schema(
            description =
                    "Whether to normalize the PDF content for better compatibility. Default is"
                            + " false.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean normalize = false;

    @Schema(
            description = "Whether to convert the PDF to grayscale. Default is false.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean grayscale = false;

    @Schema(
            description =
                    "Whether to convert images to high-contrast line art using ImageMagick. Default is false.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private Boolean lineArt = false;

    @Schema(
            description = "Threshold to use for line art conversion (0-100).",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "55")
    private Double lineArtThreshold = 55d;

    @Schema(
            description =
                    "Edge detection strength to use for line art conversion (1-3). This maps to"
                            + " ImageMagick's -edge radius.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "1",
            allowableValues = {"1", "2", "3"})
    private Integer lineArtEdgeLevel = 1;
}
