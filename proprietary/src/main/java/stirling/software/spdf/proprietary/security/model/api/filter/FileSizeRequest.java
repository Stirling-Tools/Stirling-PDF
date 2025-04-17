package stirling.software.spdf.proprietary.security.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.spdf.proprietary.security.model.api.PDFComparison;

@Data
@EqualsAndHashCode(callSuper = true)
public class FileSizeRequest extends PDFComparison {

    @Schema(description = "File Size", requiredMode = Schema.RequiredMode.REQUIRED)
    private String fileSize;
}
