package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractTablesApiRequest extends PDFFile {

    @Schema(
            description = "Response format: CSV text or the structured JSON table list",
            allowableValues = {"csv", "json"},
            defaultValue = "csv")
    private String outputFormat = "csv";
}
