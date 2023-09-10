package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class PDFPasswordRequest extends PDFFile {

    @Schema(description = "The password of the PDF file", required = true)
    private String password;
}
