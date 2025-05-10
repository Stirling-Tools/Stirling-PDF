package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ReplaceAndInvertColorRequest extends PDFFile {

    @Schema(
            description = "Replace and Invert color options of a pdf.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "HIGH_CONTRAST_COLOR",
            allowableValues = {"HIGH_CONTRAST_COLOR", "CUSTOM_COLOR", "FULL_INVERSION"})
    private ReplaceAndInvert replaceAndInvertOption;

    @Schema(
            description =
                    "If HIGH_CONTRAST_COLOR option selected, then pick the default color option for text and background.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "WHITE_TEXT_ON_BLACK",
            allowableValues = {
                "WHITE_TEXT_ON_BLACK",
                "BLACK_TEXT_ON_WHITE",
                "YELLOW_TEXT_ON_BLACK",
                "GREEN_TEXT_ON_BLACK"
            })
    private HighContrastColorCombination highContrastColorCombination;

    @Schema(
            description =
                    "If CUSTOM_COLOR option selected, then pick the custom color for background. "
                            + "Expected color value should be 24bit decimal value of a color")
    private String backGroundColor;

    @Schema(
            description =
                    "If CUSTOM_COLOR option selected, then pick the custom color for text. "
                            + "Expected color value should be 24bit decimal value of a color")
    private String textColor;
}
