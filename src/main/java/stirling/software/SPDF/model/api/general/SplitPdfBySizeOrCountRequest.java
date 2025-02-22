package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPdfBySizeOrCountRequest extends PDFFile {

    @Schema(
            description =
                    "Determines the type of split: 0 for size, 1 for page count, 2 for document count",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "0")
    private int splitType;

    @Schema(
            description =
                    "Value for split: size in MB (e.g., '10MB') or number of pages (e.g., '5')",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "10MB")
    private String splitValue;
}
