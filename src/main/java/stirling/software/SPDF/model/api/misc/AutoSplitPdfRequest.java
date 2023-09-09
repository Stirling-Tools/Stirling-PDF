package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class AutoSplitPdfRequest extends PDFFile {

    @Schema(description = "Flag indicating if the duplex mode is active, where the page after the divider also gets removed.", required = false, defaultValue = "false")
    private boolean duplexMode;
}
