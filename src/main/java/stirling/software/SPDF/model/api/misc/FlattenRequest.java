package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class FlattenRequest extends PDFFile {

    @Schema(
            description =
                    "True to flatten only the forms, false to flatten full PDF (Convert page to image)")
    private Boolean flattenOnlyForms;
}
