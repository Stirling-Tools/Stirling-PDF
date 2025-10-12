package stirling.software.SPDF.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.model.api.security.RedactionArea;

@Data
@EqualsAndHashCode(callSuper = true)
public class ManualRedactPdfRequest extends PDFWithPageNums {
    @Schema(
            description = "A list of areas that should be redacted",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<RedactionArea> redactions;

    @Schema(
            description = "Convert the redacted PDF to an image",
            defaultValue = "false",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage;

    @Schema(
            description = "The color used to fully redact certain pages",
            defaultValue = "#000000",
            pattern = "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String pageRedactionColor;
}
