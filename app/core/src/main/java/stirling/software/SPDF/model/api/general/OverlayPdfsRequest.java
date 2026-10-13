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
            description =
                    "PDF files drawn onto the base PDF's pages. overlayMode decides which overlay"
                            + " page lands on which base page.",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] overlayFiles;

    @Schema(
            description =
                    "SequentialOverlay: overlay pages go one per base page and start over when"
                            + " used up, so a 1-page letterhead repeats on every page."
                            + " InterleavedOverlay: page 1 of each overlay file in turn."
                            + " FixedRepeatOverlay: see counts.",
            allowableValues = {"SequentialOverlay", "InterleavedOverlay", "FixedRepeatOverlay"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String overlayMode;

    @Schema(
            description =
                    "Required for FixedRepeatOverlay: one count per overlay file. Each file"
                            + " in turn covers the next count x (its page count) base pages,"
                            + " showing its first page; later pages get no overlay.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private int[] counts;

    @Schema(
            description =
                    "0 = foreground, drawn over the page content. 1 = background, drawn behind it"
                            + " (e.g. a letterhead); an opaque page such as a scan hides it.",
            allowableValues = {"0", "1"},
            requiredMode = Schema.RequiredMode.REQUIRED,
            type = "number")
    private int overlayPosition;
}
