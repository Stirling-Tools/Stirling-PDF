package stirling.software.spdf.proprietary.security.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.spdf.proprietary.security.model.api.PDFComparison;

@Data
@EqualsAndHashCode(callSuper = true)
public class PageSizeRequest extends PDFComparison {

    @Schema(description = "Standard Page Size", requiredMode = Schema.RequiredMode.REQUIRED)
    private String standardPageSize;
}
