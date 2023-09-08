package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
public class ImageFile {
	@Schema(description = "The input image file")
    private MultipartFile fileInput;
}
