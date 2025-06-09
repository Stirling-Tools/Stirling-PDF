package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.MultiplePDFFiles;

@Data
@EqualsAndHashCode(callSuper = true)
public class MergePdfsRequest extends MultiplePDFFiles {

    @Schema(
            description = "The type of sorting to be applied on the input files before merging.",
            allowableValues = {
                "orderProvided",
                "byFileName",
                "byDateModified",
                "byDateCreated",
                "byPDFTitle"
            },
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "orderProvided")
    private String sortType = "orderProvided";

    @Schema(
            description =
                    "Flag indicating whether to remove certification signatures from the merged"
                            + " PDF. If true, all certification signatures will be removed from the"
                            + " final merged document.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "true")
    private Boolean removeCertSign;
}
