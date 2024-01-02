package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFComparison;

@Data
@EqualsAndHashCode(callSuper = true)
public class PageRotationRequest extends PDFComparison {

    @Schema(description = "Rotation in degrees", required = true)
    private int rotation;
}
