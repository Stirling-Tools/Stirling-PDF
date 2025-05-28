package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFExtractImagesRequest extends PDFWithImageFormatRequest {

    @Schema(
            description =
                    "Boolean to enable/disable the saving of duplicate images, true to enable"
                            + " duplicates",
            defaultValue = "false")
    private Boolean allowDuplicates;
}
