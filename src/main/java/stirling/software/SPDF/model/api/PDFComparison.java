package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFComparison extends PDFFile {

    @Schema(
            description = "The comparison type, accepts Greater, Equal, Less than",
            allowableValues = {"Greater", "Equal", "Less"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String comparator;
}
