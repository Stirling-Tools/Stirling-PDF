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
                    "The level of optimization to apply to the PDF file. Higher values indicate greater compression but may reduce quality.",
            allowableValues = {"1", "2", "3", "4", "5"})
    private Integer optimizeLevel;

    @Schema(description = "The expected output size, e.g. '100MB', '25KB', etc.")
    private String expectedOutputSize;

    @Schema(
            description = "Whether to linearize the PDF for faster web viewing. Default is false.",
            defaultValue = "false")
    private Boolean linearize = false;

    @Schema(
            description =
                    "Whether to normalize the PDF content for better compatibility. Default is false.",
            defaultValue = "false")
    private Boolean normalize = false;
}
