package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@EqualsAndHashCode
public class PDFFile {
    @Schema(
            description = "The input PDF file",
            contentMediaType = "application/pdf",
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description = "File ID for server-side files (can be used instead of fileInput)",
            example = "a1b2c3d4-5678-90ab-cdef-ghijklmnopqr")
    private String fileId;
}
