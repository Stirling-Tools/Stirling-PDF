package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PosterPdfRequest extends PDFFile {

    @Schema(
            description = "Target page size for output chunks (e.g., 'A4', 'Letter', 'A3')",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"A4", "Letter", "A3", "A5", "Legal", "Tabloid"})
    private String pageSize = "A4";

    @Schema(
            description = "Horizontal decimation factor (how many columns to split into)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "2",
            minimum = "1",
            maximum = "10")
    private int xFactor = 2;

    @Schema(
            description = "Vertical decimation factor (how many rows to split into)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "2",
            minimum = "1",
            maximum = "10")
    private int yFactor = 2;

    @Schema(
            description = "Split right-to-left instead of left-to-right",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean rightToLeft = false;
}
