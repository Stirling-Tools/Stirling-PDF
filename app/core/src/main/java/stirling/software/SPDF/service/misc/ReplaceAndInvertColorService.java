package stirling.software.SPDF.service.misc;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.Factories.ReplaceAndInvertColorFactory;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.util.misc.ReplaceAndInvertColorStrategy;

@ApplicationScoped
@RequiredArgsConstructor
public class ReplaceAndInvertColorService {
    private final ReplaceAndInvertColorFactory replaceAndInvertColorFactory;

    public InputStreamResource replaceAndInvertColor(
            MultipartFile file,
            ReplaceAndInvert replaceAndInvertOption,
            HighContrastColorCombination highContrastColorCombination,
            String backGroundColor,
            String textColor)
            throws IOException {

        ReplaceAndInvertColorStrategy replaceColorStrategy =
                replaceAndInvertColorFactory.replaceAndInvert(
                        file,
                        replaceAndInvertOption,
                        highContrastColorCombination,
                        backGroundColor,
                        textColor);

        return replaceColorStrategy.replace();
    }
}
