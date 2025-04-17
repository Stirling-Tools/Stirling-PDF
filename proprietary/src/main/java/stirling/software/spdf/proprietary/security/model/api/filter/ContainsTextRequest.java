package stirling.software.spdf.proprietary.security.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.spdf.proprietary.security.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class ContainsTextRequest extends PDFWithPageNums {

    @Schema(description = "The text to check for", requiredMode = Schema.RequiredMode.REQUIRED)
    private String text;
}
