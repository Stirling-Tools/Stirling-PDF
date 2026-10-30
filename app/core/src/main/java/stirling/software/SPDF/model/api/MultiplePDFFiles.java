package stirling.software.SPDF.model.api;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.MultiFileInput;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles implements MultiFileInput {
    @Schema(description = "The input PDF files")
    private MultipartFile[] fileInput;

    @Schema(description = "Storage references, in order, used instead of fileInput.")
    private List<String> fileIds;
}
