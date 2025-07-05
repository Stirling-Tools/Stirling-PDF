package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ImageFile {
    @Schema(
            description = "The input image file",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    @NotNull(message = "File input is required")
    private MultipartFile fileInput;
}
