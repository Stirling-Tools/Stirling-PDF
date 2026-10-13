package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class OverlayImageRequest extends PDFFile {

    @Schema(
            description =
                    "The image to draw: raster (PNG, JPEG, etc.) or SVG, which stays vector. It is"
                            + " drawn at its native size, 1 pixel = 1 point.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile imageFile;

    @Schema(
            description =
                    "X of the image's lower-left corner, in PDF points from the page's left edge"
                            + " (72 points = 1 inch).",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "0")
    private float x;

    @Schema(
            description =
                    "Y of the image's lower-left corner, in PDF points from the page's bottom edge"
                            + " (72 points = 1 inch).",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "0")
    private float y;

    @Schema(
            description = "Draw the image on every page; when false, only on page 1.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean everyPage = false;
}
