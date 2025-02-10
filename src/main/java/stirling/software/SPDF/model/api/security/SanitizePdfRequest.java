package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SanitizePdfRequest extends PDFFile {

    @Schema(description = "Remove JavaScript actions from the PDF", defaultValue = "false")
    private boolean removeJavaScript;

    @Schema(description = "Remove embedded files from the PDF", defaultValue = "false")
    private boolean removeEmbeddedFiles;

    @Schema(description = "Remove metadata from the PDF", defaultValue = "false")
    private boolean removeMetadata;

    @Schema(description = "Remove links from the PDF", defaultValue = "false")
    private boolean removeLinks;

    @Schema(description = "Remove fonts from the PDF", defaultValue = "false")
    private boolean removeFonts;
}
