package stirling.software.SPDF.model.api.misc;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ProcessPdfWithOcrRequest extends PDFFile {

    @Schema(
            description = "List of languages to use in OCR processing, e.g., 'eng', 'deu'",
            defaultValue = "[\"eng\"]")
    private List<String> languages = new ArrayList<>(List.of("eng"));

    @Schema(
            description = "Include OCR text in a sidecar text file if set to true",
            defaultValue = "false")
    private boolean sidecar;

    @Schema(description = "Deskew the input file if set to true", defaultValue = "false")
    private boolean deskew;

    @Schema(
            description =
                    "Auto-correct page orientation (90/180/270) using Tesseract OSD if set to true",
            defaultValue = "false")
    private boolean rotatePages;

    @Schema(description = "Clean the input file if set to true", defaultValue = "false")
    private boolean clean;

    @Schema(description = "Clean the final output if set to true", defaultValue = "false")
    private boolean cleanFinal;

    @Schema(
            description =
                    "How to treat pages that already contain text: 'skip-text' OCRs only pages"
                            + " without text, 'force-ocr' rasterises and OCRs every page.",
            allowableValues = {"skip-text", "force-ocr", "Normal"},
            defaultValue = "skip-text")
    private String ocrType = "skip-text";

    @Schema(
            description = "Specify the OCR render type, either 'hocr' or 'sandwich'",
            allowableValues = {"hocr", "sandwich"},
            defaultValue = "hocr")
    private String ocrRenderType = "hocr";

    @Schema(
            description = "Remove images from the output PDF if set to true",
            defaultValue = "false")
    private boolean removeImagesAfter;
}
