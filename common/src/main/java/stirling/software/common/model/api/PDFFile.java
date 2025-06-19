/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


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
            requiredMode = Schema.RequiredMode.REQUIRED,
            contentMediaType = "application/pdf",
            format = "binary")
    private MultipartFile fileInput;
}
