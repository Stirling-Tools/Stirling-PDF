package stirling.software.SPDF.model.api.misc;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ReplaceTextColorsRequest extends PDFFile {

    @Schema(
            description = "List of source text colours to replace (hex format, e.g. #FF0000)",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<String> sourceColors;

    @Schema(
            description = "Target text colour in hex format (e.g. #000000)",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String targetColor;
}
