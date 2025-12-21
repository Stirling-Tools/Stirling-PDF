package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Pattern;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfVectorExportRequest extends PDFFile {

    @Schema(
            description = "Target vector format extension",
            allowableValues = {"eps", "ps", "pcl", "xps"},
            defaultValue = "eps")
    @Pattern(regexp = "(?i)(eps|ps|pcl|xps)")
    private String outputFormat = "eps";

    @Schema(
            description = "Apply Ghostscript prepress settings",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"true", "false"},
            defaultValue = "false")
    private Boolean prepress;
}
