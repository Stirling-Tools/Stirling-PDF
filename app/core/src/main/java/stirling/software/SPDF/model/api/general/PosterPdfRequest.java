package stirling.software.SPDF.model.api.general;

import com.fasterxml.jackson.annotation.JsonProperty;

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

    private int xFactor = 2;

    private int yFactor = 2;

    @Schema(
            description = "Split right-to-left instead of left-to-right",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean rightToLeft = false;

    @JsonProperty("xFactor")
    @Schema(
            description = "Horizontal decimation factor (how many columns to split into)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "2",
            minimum = "1",
            maximum = "10")
    public int getXFactor() {
        return xFactor;
    }

    @JsonProperty("xFactor")
    public void setXFactor(int xFactor) {
        this.xFactor = xFactor;
    }

    @JsonProperty("yFactor")
    @Schema(
            description = "Vertical decimation factor (how many rows to split into)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "2",
            minimum = "1",
            maximum = "10")
    public int getYFactor() {
        return yFactor;
    }

    @JsonProperty("yFactor")
    public void setYFactor(int yFactor) {
        this.yFactor = yFactor;
    }
}
