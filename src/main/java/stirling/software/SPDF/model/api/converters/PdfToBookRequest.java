package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToBookRequest extends PDFFile {

    @Schema(
            description = "The output Ebook format",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {
                "epub", "mobi", "azw3", "docx", "rtf", "txt", "html", "lit", "fb2", "pdb", "lrf"
            })
    private String outputFormat;
}
