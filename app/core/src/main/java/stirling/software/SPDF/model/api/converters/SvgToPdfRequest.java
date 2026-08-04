package stirling.software.SPDF.model.api.converters;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class SvgToPdfRequest {

    @RestForm("fileInput")
    @Schema(
            description =
                    "The SVG file(s) to be converted to PDF. "
                            + "SVGs are scalable and have inherent dimensions - the conversion uses these dimensions "
                            + "to determine the PDF page size. If dimensions are not specified in the SVG, A4 size is used.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @RestForm("combineIntoSinglePdf")
    @Schema(
            description =
                    "Whether to combine all SVG files into a single PDF (each SVG as a separate page) "
                            + "or create separate PDF files for each SVG.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean combineIntoSinglePdf;
}
