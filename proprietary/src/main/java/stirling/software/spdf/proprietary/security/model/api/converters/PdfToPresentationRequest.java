package stirling.software.spdf.proprietary.security.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.spdf.proprietary.security.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToPresentationRequest extends PDFFile {

    @Schema(
            description = "The output Presentation format",
            allowableValues = {"ppt", "pptx", "odp"})
    private String outputFormat;
}
