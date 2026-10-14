package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPdfBySizeOrCountRequest extends PDFFile {

    @Schema(
            description = "0 = by file size, 1 = by pages per file, 2 = by number of files",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "0",
            allowableValues = {"0", "1", "2"})
    private int splitType;

    @Schema(
            description =
                    "For splitType 0 a size like '500KB' or '10MB' (a bare number means"
                            + " MB); for 1 and 2 a whole number",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "10MB")
    private String splitValue = "10MB";
}
