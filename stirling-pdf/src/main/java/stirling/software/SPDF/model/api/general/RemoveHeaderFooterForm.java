package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RemoveHeaderFooterForm extends PDFFile {

    @Schema(description = "Pages to apply the removal to (e.g., ['1', '2-4'])")
    private String pages;

    @Schema(description = "Set to true to remove the header region")
    private boolean removeHeader;

    @Schema(description = "Set to true to remove the footer region")
    private boolean removeFooter;

    @Schema(
            description =
                    "Margin from top for header removal (used in margin mode). If the value is '-1' it means a custom value was send.")
    private Float headerMargin;

    @Schema(
            description =
                    "Margin from bottom for footer removal (used in margin mode). If the value is '-1' it means a custom value was send.")
    private Float footerMargin;

    @Schema(description = "Custom header height used if footerMargin is '-1'")
    private Float headerCustomValue;

    @Schema(description = "Custom footer height used if footerMargin is '-1'")
    private Float footerCustomValue;
}
