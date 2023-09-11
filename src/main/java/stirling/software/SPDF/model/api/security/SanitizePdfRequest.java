package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper=true)
public class SanitizePdfRequest extends PDFFile {

    @Schema(description = "Remove JavaScript actions from the PDF", defaultValue = "false")
    private Boolean removeJavaScript;

    @Schema(description = "Remove embedded files from the PDF", defaultValue = "false")
    private Boolean removeEmbeddedFiles;

    @Schema(description = "Remove metadata from the PDF", defaultValue = "false")
    private Boolean removeMetadata;

    @Schema(description = "Remove links from the PDF", defaultValue = "false")
    private Boolean removeLinks;

    @Schema(description = "Remove fonts from the PDF", defaultValue = "false")
    private Boolean removeFonts;
}
