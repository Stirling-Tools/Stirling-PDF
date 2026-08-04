package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ReplaceImageRequest extends PDFFile {

    @Schema(
            description = "The replacement image file to use.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile replacementImage;

    @Schema(
            description =
                    "The 0-based index of the image to replace. If not specified, all images will be replaced.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "0")
    private Integer imageIndex;

    @Schema(
            description =
                    "The 1-based page number where the image is located. If not specified, all pages will be searched.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "1")
    private Integer pageNumber;
}
