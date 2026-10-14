package stirling.software.SPDF.model.api.misc;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MetadataRequest extends PDFFile {

    @Schema(
            description = "True removes all metadata, including XMP, and ignores the other fields",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean deleteAll = false;

    @Schema(
            description = "The author of the document. Omit to remove it.",
            example = "author",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String author;

    @Schema(
            description =
                    "The creation date of the document (format: yyyy/MM/dd HH:mm:ss). Omit to"
                            + " remove it.",
            pattern = "yyyy/MM/dd HH:mm:ss",
            example = "2023/10/01 12:00:00",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String creationDate;

    @Schema(
            description = "The creator of the document. Omit to remove it.",
            example = "creator",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String creator;

    @Schema(
            description = "The keywords for the document. Omit to remove it.",
            example = "keywords",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String keywords;

    @Schema(
            description =
                    "The modification date of the document (format: yyyy/MM/dd HH:mm:ss). Omit to"
                            + " remove it.",
            pattern = "yyyy/MM/dd HH:mm:ss",
            example = "2023/10/01 12:00:00",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String modificationDate;

    @Schema(
            description = "The producer of the document. Omit to remove it.",
            example = "producer",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String producer;

    @Schema(
            description = "The subject of the document. Omit to remove it.",
            example = "subject",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String subject;

    @Schema(
            description = "The title of the document. Omit to remove it.",
            example = "title",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String title;

    @Schema(
            description =
                    "The trapped status of the document. Omit to remove it, which readers treat"
                            + " as Unknown.",
            allowableValues = {"True", "False", "Unknown"},
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String trapped;

    @Schema(
            description =
                    "Custom metadata to add or update, e.g. {\"Department\":\"Finance\"}."
                            + " Existing custom keys are kept. customKeyN/customValueN pairs also"
                            + " work.")
    private Map<String, String> allRequestParams;
}
