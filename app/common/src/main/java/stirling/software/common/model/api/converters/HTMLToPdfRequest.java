package stirling.software.common.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class HTMLToPdfRequest extends PDFFile {

    @Schema(
            description = "Zoom level for displaying the website. Default is '1'.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "1")
    private float zoom;
}
