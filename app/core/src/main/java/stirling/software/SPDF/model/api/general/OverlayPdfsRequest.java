package stirling.software.SPDF.model.api.general;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class OverlayPdfsRequest extends PDFFile {

    @Schema(
            description = "PDFs drawn onto the base PDF's pages, in the order set by overlayMode",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] overlayFiles;

    @Schema(
            description =
                    "SequentialOverlay repeats the overlay pages in order (e.g. a"
                            + " letterhead on every page). InterleavedOverlay takes each overlay file"
                            + " in turn. FixedRepeatOverlay uses counts.",
            allowableValues = {"SequentialOverlay", "InterleavedOverlay", "FixedRepeatOverlay"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String overlayMode;

    @Schema(
            description = "FixedRepeatOverlay only: one repeat count per overlay file",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private int[] counts;

    @Schema(
            description = "0 = foreground (over the content), 1 = background (behind it)",
            allowableValues = {"0", "1"},
            requiredMode = Schema.RequiredMode.REQUIRED,
            type = "number")
    private int overlayPosition;
}
