package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.web.multipart.MultipartFile;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles {
    @Schema(description = "The input PDF files", requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;
}
