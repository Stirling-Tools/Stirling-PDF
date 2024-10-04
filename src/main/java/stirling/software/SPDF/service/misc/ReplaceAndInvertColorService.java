package stirling.software.SPDF.service.misc;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.Factories.ReplaceAndInvertColorFactory;
import stirling.software.SPDF.model.api.misc.HighContrastColorCombination;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;
import stirling.software.SPDF.utils.misc.ReplaceAndInvertColorStrategy;

@Service
public class ReplaceAndInvertColorService {
    private ReplaceAndInvertColorFactory replaceAndInvertColorFactory;

    @Autowired
    public ReplaceAndInvertColorService(ReplaceAndInvertColorFactory replaceAndInvertColorFactory) {
        this.replaceAndInvertColorFactory = replaceAndInvertColorFactory;
    }

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
