package stirling.software.SPDF.model.api.misc;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddAttachmentRequest extends PDFFile {

    @Schema(
            description = "The image file to be overlaid onto the PDF.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private List<MultipartFile> attachments;
}
