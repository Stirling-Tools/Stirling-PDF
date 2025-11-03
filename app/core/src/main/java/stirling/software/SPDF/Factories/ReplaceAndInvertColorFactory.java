package stirling.software.SPDF.Factories;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.misc.ColorSpaceConversionStrategy;
import stirling.software.common.util.misc.CustomColorReplaceStrategy;
import stirling.software.common.util.misc.InvertFullColorStrategy;
import stirling.software.common.util.misc.ReplaceAndInvertColorStrategy;

@Component
@RequiredArgsConstructor
public class ReplaceAndInvertColorFactory {

    private final TempFileManager tempFileManager;

    public ReplaceAndInvertColorStrategy replaceAndInvert(
            MultipartFile file,
            ReplaceAndInvert replaceAndInvertOption,
            HighContrastColorCombination highContrastColorCombination,
            String backGroundColor,
            String textColor) {

        if (replaceAndInvertOption == null) {
            return null;
        }

        return switch (replaceAndInvertOption) {
            case CUSTOM_COLOR, HIGH_CONTRAST_COLOR ->
                    new CustomColorReplaceStrategy(
                            file,
                            replaceAndInvertOption,
                            textColor,
                            backGroundColor,
                            highContrastColorCombination);
            case FULL_INVERSION -> new InvertFullColorStrategy(file, replaceAndInvertOption);
            case COLOR_SPACE_CONVERSION ->
                    new ColorSpaceConversionStrategy(file, replaceAndInvertOption, tempFileManager);
        };
    }
}
