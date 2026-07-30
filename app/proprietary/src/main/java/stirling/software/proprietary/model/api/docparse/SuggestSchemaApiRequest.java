package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SuggestSchemaApiRequest extends PDFFile {

    @Schema(description = "Maximum number of fields to suggest (1-20)", defaultValue = "10")
    private int maxFields = 10;
}
