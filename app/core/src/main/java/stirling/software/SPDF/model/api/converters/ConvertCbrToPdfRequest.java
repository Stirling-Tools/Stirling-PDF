package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class ConvertCbrToPdfRequest {

    @Schema(
            description = "The input CBR file to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @Schema(
            description = "Optimize the output PDF for ebook reading using Ghostscript",
            defaultValue = "false")
    private boolean optimizeForEbook;
}
