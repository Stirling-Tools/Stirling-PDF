package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class OverlayImageRequest extends PDFFile {

    @Schema(description = "The image file to be overlaid onto the PDF.")
    private MultipartFile imageFile;

    @Schema(
            description = "The x-coordinate at which to place the top-left corner of the image.",
            example = "0")
    private float x;

    @Schema(
            description = "The y-coordinate at which to place the top-left corner of the image.",
            example = "0")
    private float y;

    @Schema(
            description = "Whether to overlay the image onto every page of the PDF.",
            example = "false")
    private boolean everyPage;
}
