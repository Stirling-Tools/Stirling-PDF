package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFComparison;

@Data
@EqualsAndHashCode(callSuper = true)
public class FileSizeRequest extends PDFComparison {

    @Schema(
            description = "Size of the file in bytes",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "0")
    private long fileSize;
}
