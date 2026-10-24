package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.SplitOutputNamingRequest;

@Data
@EqualsAndHashCode(callSuper = true)
public class AutoSplitPdfRequest extends SplitOutputNamingRequest {

    @Schema(
            description =
                    "Flag indicating if the duplex mode is active, where the page after the divider also gets removed.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "false")
    private Boolean duplexMode;
}
