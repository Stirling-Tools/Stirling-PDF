package stirling.software.SPDF.model.api.misc;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MetadataRequest extends PDFFile {

    @Schema(
            description = "Delete all metadata if set to true",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean deleteAll;

    @Schema(
            description = "The author of the document",
            defaultValue = "author",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String author;

    @Schema(
            description = "The creation date of the document (format: yyyy/MM/dd HH:mm:ss)",
            pattern = "yyyy/MM/dd HH:mm:ss",
            defaultValue = "2023/10/01 12:00:00",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String creationDate;

    @Schema(
            description = "The creator of the document",
            defaultValue = "creator",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String creator;

    @Schema(
            description = "The keywords for the document",
            defaultValue = "keywords",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String keywords;

    @Schema(
            description = "The modification date of the document (format: yyyy/MM/dd HH:mm:ss)",
            pattern = "yyyy/MM/dd HH:mm:ss",
            defaultValue = "2023/10/01 12:00:00",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String modificationDate;

    @Schema(
            description = "The producer of the document",
            defaultValue = "producer",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String producer;

    @Schema(
            description = "The subject of the document",
            defaultValue = "subject",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String subject;

    @Schema(
            description = "The title of the document",
            defaultValue = "title",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String title;

    @Schema(
            description = "The trapped status of the document",
            defaultValue = "False",
            allowableValues = {"True", "False", "Unknown"},
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String trapped;

    @Schema(
            description =
                    "Map list of key and value of custom parameters. Note these must start with"
                            + " customKey and customValue if they are non-standard")
    private Map<String, String> allRequestParams;
}
