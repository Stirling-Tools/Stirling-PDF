package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

/** A split request whose output documents can be renamed, resolved by {@code SplitOutputNames}. */
@Data
@EqualsAndHashCode(callSuper = true)
public class SplitOutputNamingRequest extends PDFFile {

    @Schema(
            description =
                    "Name for every split document, where {n} is the document number (1, 2, 3...);"
                            + " without {n} the number is appended. A name from outputNames takes"
                            + " precedence for its document.",
            example = "Chapter {n}",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String outputNamePattern;

    @Schema(
            description =
                    "Output file names, one per line, applied in order to the split documents."
                            + " Documents beyond the list keep the default name.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String outputNames;
}
