package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SignatureValidationRequest extends PDFFile {

    @Schema(
            description = "(Optional) file to compare PDF cert signatures against x.509 format",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private MultipartFile certFile;
}
