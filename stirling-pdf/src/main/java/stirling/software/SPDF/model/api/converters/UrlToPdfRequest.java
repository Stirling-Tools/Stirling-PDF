package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class UrlToPdfRequest {

    @Schema(
            description = "The input URL to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String urlInput;
}
