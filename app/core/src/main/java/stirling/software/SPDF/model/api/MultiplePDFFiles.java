package stirling.software.SPDF.model.api;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class MultiplePDFFiles {
    @RestForm("fileInput")
    @Schema(description = "The input PDF files", requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;
}
