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
            description = "The image to draw (raster or SVG), at native size",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile imageFile;

    @Schema(
            description = "X of the image's lower-left corner, in points from the left edge",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "0")
    private float x;

    @Schema(
            description = "Y of the image's lower-left corner, in points from the bottom edge",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "0")
    private float y;

    @Schema(
            description = "Draw the image on every page; when false, only on page 1.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean everyPage = false;
}
