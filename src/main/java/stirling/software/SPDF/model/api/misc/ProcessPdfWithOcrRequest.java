package stirling.software.SPDF.model.api.misc;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ProcessPdfWithOcrRequest extends PDFFile {

    @Schema(
            description = "List of languages to use in OCR processing, e.g., 'eng', 'deu'",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "[\"eng\"]")
    private List<String> languages;

    @Schema(
            description = "Specify the OCR type, e.g., 'skip-text', 'force-ocr', or 'Normal'",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"skip-text", "force-ocr", "Normal"})
    private String ocrType;

    @Schema(
            description = "Specify the OCR render type, either 'hocr' or 'sandwich'",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"hocr", "sandwich"},
            defaultValue = "hocr")
    private String ocrRenderType = "hocr";
}
