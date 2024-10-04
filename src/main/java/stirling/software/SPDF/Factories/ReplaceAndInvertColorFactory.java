package stirling.software.SPDF.Factories;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.HighContrastColorCombination;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;
import stirling.software.SPDF.utils.misc.CustomColorReplaceStrategy;
import stirling.software.SPDF.utils.misc.InvertFullColorStrategy;
import stirling.software.SPDF.utils.misc.ReplaceAndInvertColorStrategy;

@Component
public class ReplaceAndInvertColorFactory {

    public ReplaceAndInvertColorStrategy replaceAndInvert(
            MultipartFile file,
            ReplaceAndInvert replaceAndInvertOption,
            HighContrastColorCombination highContrastColorCombination,
            String backGroundColor,
            String textColor) {

        if (replaceAndInvertOption == ReplaceAndInvert.CUSTOM_COLOR
                || replaceAndInvertOption == ReplaceAndInvert.HIGH_CONTRAST_COLOR) {

            return new CustomColorReplaceStrategy(
                    file,
                    replaceAndInvertOption,
                    textColor,
                    backGroundColor,
                    highContrastColorCombination);

        } else if (replaceAndInvertOption == ReplaceAndInvert.FULL_INVERSION) {

            return new InvertFullColorStrategy(file, replaceAndInvertOption);
        }

        return null;
    }
}
