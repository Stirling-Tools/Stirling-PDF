package stirling.software.SPDF.model.api.converters;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class ConvertCbzToPdfRequest {

    @RestForm("fileInput")
    @Schema(
            description = "The input CBZ file to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @RestForm("optimizeForEbook")
    @Schema(
            description = "Optimize the output PDF for ebook reading using Ghostscript",
            defaultValue = "false")
    private boolean optimizeForEbook;
}
