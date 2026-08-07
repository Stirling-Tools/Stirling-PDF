package stirling.software.SPDF.model.api.ua;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AccessibilityReportRequest extends PDFFile {

    @Schema(
            description = "Profile to check against",
            defaultValue = "ua1",
            allowableValues = {"ua1", "ua2"})
    private String profile;
}
