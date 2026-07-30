package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ParseDocumentApiRequest extends PDFFile {

    @Schema(
            description = "Tier to use: 'auto' picks per document, or force 'basic'/'advanced'",
            allowableValues = {"auto", "basic", "advanced"},
            defaultValue = "auto")
    private String mode = "auto";

    @Schema(
            description = "Apply OCR when parsing scanned pages (advanced tier only)",
            defaultValue = "true")
    private boolean withOcr = true;

    @Schema(
            description = "Response format: full JSON result or the markdown rendering only",
            allowableValues = {"json", "markdown"},
            defaultValue = "json")
    private String outputFormat = "json";
}
