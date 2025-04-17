package stirling.software.spdf.proprietary.security.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithImageFormatRequest;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFExtractImagesRequest extends PDFWithImageFormatRequest {

    @Schema(
            description =
                    "Boolean to enable/disable the saving of duplicate images, true to enable duplicates")
    private boolean allowDuplicates;
}
