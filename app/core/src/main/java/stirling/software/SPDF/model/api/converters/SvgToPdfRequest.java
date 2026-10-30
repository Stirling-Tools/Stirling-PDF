package stirling.software.SPDF.model.api.converters;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.MultiFileInput;

@Data
@EqualsAndHashCode
public class SvgToPdfRequest implements MultiFileInput {

    @Schema(
            description =
                    "The SVG file(s) to be converted to PDF. "
                            + "SVGs are scalable and have inherent dimensions - the conversion uses these dimensions "
                            + "to determine the PDF page size. If dimensions are not specified in the SVG, A4 size is used.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @Schema(description = "Persistent storage references, in order, used instead of fileInput.")
    private List<String> fileIds;

    @Schema(
            description =
                    "Whether to combine all SVG files into a single PDF (each SVG as a separate page) "
                            + "or create separate PDF files for each SVG.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean combineIntoSinglePdf;
}
