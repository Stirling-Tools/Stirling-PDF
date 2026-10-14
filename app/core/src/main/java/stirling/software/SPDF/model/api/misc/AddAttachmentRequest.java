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
            description = "Files to attach to the PDF (up to 50 MB each, 200 MB in total)",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private List<MultipartFile> attachments;

    @Schema(
            description = "Convert the resulting PDF to PDF/A-3b format after adding attachments",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private boolean convertToPdfA3b = false;
}
