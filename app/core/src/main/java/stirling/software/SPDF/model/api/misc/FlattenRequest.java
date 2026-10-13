package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class FlattenRequest extends PDFFile {

    @Schema(
            description =
                    "True only locks form fields (merges them into the page, text stays"
                            + " selectable). False turns every page into an image, so text can no"
                            + " longer be selected.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean flattenOnlyForms = false;

    @Schema(
            description =
                    "DPI for the page images when flattenOnlyForms is false (300 if omitted,"
                            + " capped by the server's maximum DPI). Ignored when"
                            + " flattenOnlyForms is true.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            minimum = "72")
    private Integer renderDpi;
}
