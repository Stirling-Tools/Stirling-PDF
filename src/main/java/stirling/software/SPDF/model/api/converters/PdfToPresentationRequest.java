package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class PdfToPresentationRequest extends PDFFile {

    @Schema(description = "The output Presentation format", allowableValues = {"ppt", "pptx", "odp"})
    private String outputFormat;
}
