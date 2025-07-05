package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles {
    @Schema(description = "The input PDF files", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "File input is required")
    @Size(min = 1)
    private MultipartFile[] fileInput;
}
