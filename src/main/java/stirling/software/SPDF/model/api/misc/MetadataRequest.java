package stirling.software.SPDF.model.api.misc;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MetadataRequest extends PDFFile {

    @Schema(description = "Delete all metadata if set to true")
    private boolean deleteAll;

    @Schema(description = "The author of the document")
    private String author;

    @Schema(description = "The creation date of the document (format: yyyy/MM/dd HH:mm:ss)")
    private String creationDate;

    @Schema(description = "The creator of the document")
    private String creator;

    @Schema(description = "The keywords for the document")
    private String keywords;

    @Schema(description = "The modification date of the document (format: yyyy/MM/dd HH:mm:ss)")
    private String modificationDate;

    @Schema(description = "The producer of the document")
    private String producer;

    @Schema(description = "The subject of the document")
    private String subject;

    @Schema(description = "The title of the document")
    private String title;

    @Schema(description = "The trapped status of the document")
    private String trapped;

    @Schema(
            description =
                    "Map list of key and value of custom parameters. Note these must start with customKey and customValue if they are non-standard")
    private Map<String, String> allRequestParams;
}
