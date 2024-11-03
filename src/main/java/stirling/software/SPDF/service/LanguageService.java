package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

@Service
public class LanguageService {

    private final PathMatchingResourcePatternResolver resourcePatternResolver =
            new PathMatchingResourcePatternResolver();

    public List<String> getSupportedLanguages() {
        List<String> supportedLanguages = new ArrayList<>();

        try {
            Resource[] resources =
                    resourcePatternResolver.getResources("classpath*:messages_*.properties");
            for (Resource resource : resources) {
                if (resource.exists() && resource.isReadable()) {
                    String filename = resource.getFilename();
                    if (filename != null
                            && filename.startsWith("messages_")
                            && filename.endsWith(".properties")) {
                        String languageCode =
                                filename.replace("messages_", "").replace(".properties", "");
                        supportedLanguages.add(languageCode);
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return supportedLanguages;
    }
}
