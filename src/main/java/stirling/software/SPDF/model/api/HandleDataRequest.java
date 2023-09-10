package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

@Data
public class HandleDataRequest {

    @Schema(description = "The input files")
    private MultipartFile[] fileInputs;

    @Schema(description = "JSON String")
    private String jsonString;
}
