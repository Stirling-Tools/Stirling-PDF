package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToMarkdownRequest extends PDFFile {

    @Schema(
            description = "Embed images from the PDF as base64 data URIs in the Markdown output",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "false")
    private boolean includeImages = false;
}
