package stirling.software.proprietary.model.api.docparse;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SmartSplitApiRequest extends PDFFile {

    @Schema(
            description = "Natural-language boundary rule, e.g. 'split where a new invoice starts'",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String rule;

    @Schema(description = "Maximum number of parts to produce (1-500)", defaultValue = "50")
    private int maxParts = 50;
}
