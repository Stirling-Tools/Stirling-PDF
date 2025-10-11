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

    @Schema(description = "Apply Ghostscript grayscale conversion", defaultValue = "false")
    private Boolean grayscale;

    @Schema(description = "Fit pages to bounding box", defaultValue = "false")
    private Boolean fitPage;

    @Schema(description = "Crop output to EPS bounding box", defaultValue = "true")
    private Boolean cropToBoundingBox;

    @Schema(description = "Apply Ghostscript prepress settings", defaultValue = "false")
    private Boolean prepress;

    @Schema(
            description = "Disable Ghostscript image cache to avoid rasterization",
            defaultValue = "true")
    private Boolean disableCache;
}
