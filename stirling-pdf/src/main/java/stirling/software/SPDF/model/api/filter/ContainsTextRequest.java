package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class ContainsTextRequest extends PDFWithPageNums {

    @Schema(
            description = "The text to check for",
            defaultValue = "text",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String text;
}
