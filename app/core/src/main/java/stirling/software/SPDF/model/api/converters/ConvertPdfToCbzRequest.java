package stirling.software.SPDF.model.api.converters;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class ConvertPdfToCbzRequest {

    @RestForm("fileInput")
    @Schema(
            description = "The input PDF file to be converted to a CBZ file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private FileUpload fileInput;

    @RestForm("dpi")
    @Schema(
            description = "The DPI (Dots Per Inch) for rendering PDF pages as images",
            example = "150",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int dpi = 150;

    // TODO: Migration required - controller binds this model via @BeanParam multipart.
    // The 'fileInput' field is a raw FileUpload for form binding; the controller must adapt it
    // to a stirling.software.common.model.MultipartFile via FileUploadMultipartFile.of(fileInput).
    public MultipartFile getFileInputAsMultipartFile() {
        return stirling.software.common.model.multipart.FileUploadMultipartFile.of(fileInput);
    }
}
