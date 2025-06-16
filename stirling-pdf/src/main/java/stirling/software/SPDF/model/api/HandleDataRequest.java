package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.web.multipart.MultipartFile;

@Data
@EqualsAndHashCode
public class HandleDataRequest {

    @Schema(description = "The input files", requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @Schema(
            description = "JSON String",
            defaultValue = "{}",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String json;
}
