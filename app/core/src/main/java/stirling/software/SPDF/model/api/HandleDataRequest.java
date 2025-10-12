package stirling.software.SPDF.model.api;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class HandleDataRequest {

    @Schema(description = "The input files", requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @Schema(
            description =
                    "Pipeline configuration in JSON format containing name and operations list",
            type = "string",
            example =
                    "{\\\"name\\\":\\\"Prepare-pdfs-for-email\\\",\\\"pipeline\\\":[{\\\"operation\\\":\\\"/api/v1/misc/repair\\\",\\\"parameters\\\":{}},{\\\"operation\\\":\\\"/api/v1/security/sanitize-pdf\\\",\\\"parameters\\\":{\\\"removeJavaScript\\\":true,\\\"removeEmbeddedFiles\\\":false}},{\\\"operation\\\":\\\"/api/v1/misc/compress-pdf\\\",\\\"parameters\\\":{\\\"optimizeLevel\\\":2}}]}",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String json;
}
