package stirling.software.SPDF.model.api.misc;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class CreatePortfolioRequest {

    @Schema(
            description = "The files to bundle into the PDF Portfolio.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private List<MultipartFile> files;

    @Schema(
            description = "Title shown on the portfolio cover page.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "PDF Portfolio")
    private String coverTitle;
}
