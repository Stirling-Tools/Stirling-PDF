package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class UrlToPdfRequest {

    @Schema(description = "The input URL to be converted to a PDF file", required = true)
    private String urlInput;
}
