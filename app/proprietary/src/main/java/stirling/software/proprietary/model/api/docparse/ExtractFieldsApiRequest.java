package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractFieldsApiRequest extends PDFFile {

    @Schema(
            description = "JSON Schema object describing the fields to extract, as a JSON string",
            requiredMode = Schema.RequiredMode.REQUIRED,
            example =
                    "{\"type\":\"object\",\"properties\":{\"invoiceNumber\":{\"type\":\"string\"}}}")
    private String fieldsSchema;

    @Schema(
            description = "Tier to use: 'auto' picks per document, or force 'basic'/'advanced'",
            allowableValues = {"auto", "basic", "advanced"},
            defaultValue = "auto")
    private String mode = "auto";

    @Schema(description = "Optional natural-language guidance for the extraction")
    private String instructions;
}
