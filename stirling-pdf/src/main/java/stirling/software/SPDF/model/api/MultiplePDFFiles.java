package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles {
    @Schema(description = "The input PDF files", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    @NotNull(message = "File input is required")
    private MultipartFile[] fileInput;
}
