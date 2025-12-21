package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ConvertEbookToPdfRequest {

    @Schema(
            description =
                    "The input eBook file to be converted to a PDF file (EPUB, MOBI, AZW3, FB2,"
                            + " TXT, DOCX)",
            contentMediaType =
                    "application/epub+zip, application/x-mobipocket-ebook, application/x-azw3,"
                            + " text/xml, text/plain,"
                            + " application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @Schema(
            description = "Embed all fonts from the eBook into the generated PDF",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean embedAllFonts;

    @Schema(
            description = "Add a generated table of contents to the resulting PDF",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"true", "false"},
            defaultValue = "false")
    private Boolean includeTableOfContents;

    @Schema(
            description = "Add page numbers to the generated PDF",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"true", "false"},
            defaultValue = "false")
    private Boolean includePageNumbers;

    @Schema(
            description =
                    "Optimize the PDF for eBook reading (smaller file size, better rendering on"
                            + " eInk devices)",
            allowableValues = {"true", "false"},
            defaultValue = "false")
    private Boolean optimizeForEbook;
}
