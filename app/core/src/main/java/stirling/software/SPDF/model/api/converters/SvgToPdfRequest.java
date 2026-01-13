package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class SvgToPdfRequest {

    @Schema(
            description =
                    "The SVG file(s) to be converted to PDF. "
                            + "SVGs are scalable and have inherent dimensions - the conversion uses these dimensions "
                            + "to determine the PDF page size. If dimensions are not specified in the SVG, A4 size is used.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @Schema(
            description =
                    "Whether to combine all SVG files into a single PDF (each SVG as a separate page) "
                            + "or create separate PDF files for each SVG.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean combineIntoSinglePdf;

    @Schema(
            description =
                    "Option to determine how the SVG will fit onto the page when combining. "
                            + "Only used when combineIntoSinglePdf is true.",
            defaultValue = "maintainAspectRatio",
            allowableValues = {"fillPage", "fitDocumentToImage", "maintainAspectRatio"})
    private String fitOption;

    @Schema(
            description =
                    "Whether to automatically rotate the SVGs to better fit the PDF page when combining. "
                            + "Only used when combineIntoSinglePdf is true.",
            defaultValue = "false")
    private Boolean autoRotate;
}
