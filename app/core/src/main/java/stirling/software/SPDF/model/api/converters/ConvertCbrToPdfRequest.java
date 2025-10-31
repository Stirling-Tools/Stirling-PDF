package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ConvertCbrToPdfRequest {

    @Schema(
            description = "The input CBR file to be converted to a PDF file",
            contentMediaType = "application/vnd.comicbook+rar",
            format = "binary",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @Schema(
            description = "Optimize the output PDF for ebook reading using Ghostscript",
            defaultValue = "false")
    private boolean optimizeForEbook;
}
