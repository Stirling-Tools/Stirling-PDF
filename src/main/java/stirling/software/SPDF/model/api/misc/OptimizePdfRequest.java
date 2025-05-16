package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class OptimizePdfRequest extends PDFFile {

    @Schema(
            description =
                    "The level of optimization to apply to the PDF file. Higher values indicate"
                            + " greater compression but may reduce quality.",
            defaultValue = "5",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"})
    private Integer optimizeLevel;

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
}
