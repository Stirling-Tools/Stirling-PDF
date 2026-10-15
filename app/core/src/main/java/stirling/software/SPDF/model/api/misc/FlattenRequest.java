package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class FlattenRequest extends PDFFile {

    @Schema(
            description = "True flattens only form fields; false turns every page into an image",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean flattenOnlyForms = false;

    @Schema(
            description = "DPI for the page images when flattening full pages (default 300)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            minimum = "72")
    private Integer renderDpi;
}
