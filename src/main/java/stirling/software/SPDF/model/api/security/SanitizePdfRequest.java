package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SanitizePdfRequest extends PDFFile {

    @Schema(
            description = "Remove JavaScript actions from the PDF",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeJavaScript;

    @Schema(
            description = "Remove embedded files from the PDF",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeEmbeddedFiles;

    @Schema(
            description = "Remove XMP metadata from the PDF",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeXMPMetadata;

    @Schema(
            description = "Remove document info metadata from the PDF",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeMetadata;

    @Schema(
            description = "Remove links from the PDF",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeLinks;

    @Schema(
            description = "Remove fonts from the PDF",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean removeFonts;
}
