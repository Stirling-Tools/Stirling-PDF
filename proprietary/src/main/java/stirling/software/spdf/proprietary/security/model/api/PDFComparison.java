package stirling.software.spdf.proprietary.security.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class PDFComparison extends PDFFile {

    @Schema(
            description = "The comparison type, accepts Greater, Equal, Less than",
            allowableValues = {"Greater", "Equal", "Less"})
    private String comparator;
}
