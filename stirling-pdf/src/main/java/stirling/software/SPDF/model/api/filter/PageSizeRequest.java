package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFComparison;

@Data
@EqualsAndHashCode(callSuper = true)
public class PageSizeRequest extends PDFComparison {

    @Schema(
            description = "Standard Page Size",
            allowableValues = {"A0", "A1", "A2", "A3", "A4", "A5", "A6", "LETTER", "LEGAL"},
            defaultValue = "A4",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String standardPageSize;
}
