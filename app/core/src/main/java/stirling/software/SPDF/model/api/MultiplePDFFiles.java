package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.util.GeneralUtils;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles {
    @Schema(description = "The input PDF files", requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    public MultipartFile[] getFileInput() {
        if (fileInput != null) {
            for (MultipartFile file : fileInput) {
                GeneralUtils.checkMaxUploadSize(file);
            }
        }
        return fileInput;
    }
}
