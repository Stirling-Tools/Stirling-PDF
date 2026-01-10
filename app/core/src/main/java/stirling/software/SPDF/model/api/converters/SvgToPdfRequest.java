package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class SvgToPdfRequest {

    @Schema(
            description = "The SVG file to be converted to PDF",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;
}
